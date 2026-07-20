//! Reference Rust adapter for the doppel port-verification protocol.
//!
//! The host (`doppel check`) spawns the adapter as a subprocess and speaks
//! newline-delimited JSON over stdio: `init` -> `ready`, then one `invoke`
//! per recorded interaction answered by a `result`, then `end`. Keeping the
//! adapter a plain binary over a serialized contract is what makes doppel
//! language-neutral: supporting another language is a new binary, not a new
//! FFI binding layer.
//!
//! v0 limitation: redaction rules from the contract header are not re-applied
//! on this side, so contracts relying on redaction should verify through an
//! adapter that implements them (the bundled JS adapter does).

use serde_json::{json, Map, Value};
use std::io::{self, BufRead, Write};

pub struct AdapterError {
    pub name: String,
    pub message: String,
}

impl AdapterError {
    pub fn new(name: &str, message: &str) -> Self {
        Self {
            name: name.to_string(),
            message: message.to_string(),
        }
    }
}

pub trait Adapter {
    fn name(&self) -> &str {
        "rust-adapter"
    }
    fn invoke(&mut self, boundary: &str, args: Vec<Value>) -> Result<Value, AdapterError>;
}

/// Resolve a doppel value graph (`{"r": root, "n": [nodes...]}`) into a plain
/// JSON tree. Cycles resolve to the string `"~cycle"`; non-data nodes come
/// back as `{"$doppel": tag, ...}` sentinels.
pub fn materialize(graph: &Value) -> Value {
    let root = graph["r"].as_u64().unwrap_or(0) as usize;
    let empty = Vec::new();
    let nodes = graph["n"].as_array().unwrap_or(&empty);
    build(nodes, root, &mut Vec::new())
}

fn build(nodes: &[Value], idx: usize, stack: &mut Vec<usize>) -> Value {
    if stack.contains(&idx) {
        return Value::String("~cycle".to_string());
    }
    let node = match nodes.get(idx) {
        Some(Value::Array(tuple)) => tuple,
        _ => return Value::Null,
    };
    let tag = node.first().and_then(|v| v.as_str()).unwrap_or("");
    stack.push(idx);
    let out = match tag {
        "prim" => node.get(1).cloned().unwrap_or(Value::Null),
        "undef" => Value::Null,
        "arr" | "set" => {
            let mut items = Vec::new();
            if let Some(children) = node.get(1).and_then(|v| v.as_array()) {
                for child in children {
                    if let Some(i) = child.as_u64() {
                        items.push(build(nodes, i as usize, stack));
                    }
                }
            }
            Value::Array(items)
        }
        "obj" => {
            let mut map = Map::new();
            if let Some(entries) = node.get(1).and_then(|v| v.as_array()) {
                for entry in entries {
                    let pair = match entry.as_array() {
                        Some(p) => p,
                        None => continue,
                    };
                    let key = pair.first().and_then(|v| v.as_str()).unwrap_or("");
                    let child = pair.get(1).and_then(|v| v.as_u64()).unwrap_or(0);
                    map.insert(key.to_string(), build(nodes, child as usize, stack));
                }
            }
            Value::Object(map)
        }
        "map" => {
            let mut pairs = Vec::new();
            let mut string_keyed = Map::new();
            let mut all_strings = true;
            if let Some(entries) = node.get(1).and_then(|v| v.as_array()) {
                for entry in entries {
                    let pair = match entry.as_array() {
                        Some(p) => p,
                        None => continue,
                    };
                    let k = pair.first().and_then(|v| v.as_u64()).unwrap_or(0);
                    let v = pair.get(1).and_then(|v| v.as_u64()).unwrap_or(0);
                    let key = build(nodes, k as usize, stack);
                    let value = build(nodes, v as usize, stack);
                    if let Value::String(s) = &key {
                        string_keyed.insert(s.clone(), value.clone());
                    } else {
                        all_strings = false;
                    }
                    pairs.push(Value::Array(vec![key, value]));
                }
            }
            if all_strings {
                Value::Object(string_keyed)
            } else {
                json!({"$doppel": "map", "entries": pairs})
            }
        }
        other => {
            json!({"$doppel": other, "info": node.get(1).cloned().unwrap_or(Value::Null)})
        }
    };
    stack.pop();
    out
}

/// Capture a plain JSON tree as a doppel value graph with canonical (sorted)
/// object-key traversal, mirroring the TypeScript capturer.
pub fn snapshot(value: &Value) -> Value {
    let mut nodes: Vec<Value> = Vec::new();
    let r = visit(value, &mut nodes);
    json!({ "r": r, "n": nodes })
}

fn visit(value: &Value, nodes: &mut Vec<Value>) -> usize {
    let idx = nodes.len();
    nodes.push(Value::Null);
    let node = match value {
        Value::Null => json!(["prim", Value::Null]),
        Value::Bool(b) => json!(["prim", b]),
        Value::Number(n) => json!(["prim", n]),
        Value::String(s) => json!(["prim", s]),
        Value::Array(items) => {
            let mut ids = Vec::new();
            for item in items {
                ids.push(visit(item, nodes));
            }
            json!(["arr", ids])
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut entries = Vec::new();
            for key in keys {
                let child = visit(&map[key], nodes);
                entries.push(json!([key, child]));
            }
            json!(["obj", entries])
        }
    };
    nodes[idx] = node;
    idx
}

/// Run the adapter protocol loop over stdio until the host sends `end`.
pub fn serve<A: Adapter>(mut adapter: A) -> io::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let frame: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                writeln!(out, "{}", json!({"op": "error", "message": format!("invalid frame: {e}")}))?;
                out.flush()?;
                continue;
            }
        };
        match frame["op"].as_str() {
            Some("init") => {
                writeln!(
                    out,
                    "{}",
                    json!({"op": "ready", "adapter": adapter.name(), "language": "rust"})
                )?;
                out.flush()?;
            }
            Some("invoke") => {
                let seq = frame["seq"].clone();
                let boundary = frame["boundary"].as_str().unwrap_or("").to_string();
                let args = match materialize(&frame["args"]) {
                    Value::Array(items) => items,
                    other => vec![other],
                };
                let outcome = match adapter.invoke(&boundary, args) {
                    Ok(value) => json!({"kind": "return", "value": snapshot(&value)}),
                    Err(err) => {
                        json!({"kind": "throw", "error": {"name": err.name, "message": err.message}})
                    }
                };
                writeln!(out, "{}", json!({"op": "result", "seq": seq, "outcome": outcome}))?;
                out.flush()?;
            }
            Some("end") => break,
            _ => {
                writeln!(out, "{}", json!({"op": "error", "message": "unknown op"}))?;
                out.flush()?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn materialize_snapshot_round_trip() {
        let graph = json!({
            "r": 0,
            "n": [
                ["obj", [["nums", 1], ["name", 4]]],
                ["arr", [2, 3]],
                ["prim", 1.5],
                ["prim", 2],
                ["prim", "hi"]
            ]
        });
        let value = materialize(&graph);
        assert_eq!(value, json!({"nums": [1.5, 2], "name": "hi"}));

        let round = materialize(&snapshot(&value));
        assert_eq!(round, value);
    }

    #[test]
    fn snapshot_sorts_object_keys() {
        let a = snapshot(&json!({"b": 1, "a": 2}));
        let b = snapshot(&json!({"a": 2, "b": 1}));
        assert_eq!(a, b);
    }

    #[test]
    fn cycles_terminate() {
        let graph = json!({"r": 0, "n": [["obj", [["self", 0]]]]});
        let value = materialize(&graph);
        assert_eq!(value, json!({"self": "~cycle"}));
    }
}
