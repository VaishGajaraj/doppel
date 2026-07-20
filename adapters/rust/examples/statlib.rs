//! A correct Rust port of examples/statlib/reference/statlib.js, served as a
//! doppel adapter. With the recorded contract from the statlib example:
//!
//!   cargo build --example statlib
//!   doppel check \
//!     --contract examples/statlib/contracts/statlib.dopl.jsonl \
//!     --adapter "./adapters/rust/target/debug/examples/statlib"
//!
//! Every operation mirrors the reference implementation's order of floating-
//! point operations, so results are bit-identical and the check reports all
//! interactions identical.

use doppel_adapter::{serve, Adapter, AdapterError};
use serde_json::{json, Value};

fn nums(v: &Value) -> Result<Vec<f64>, AdapterError> {
    let arr = v
        .as_array()
        .ok_or_else(|| AdapterError::new("TypeError", "expected an array of numbers"))?;
    arr.iter()
        .map(|x| {
            x.as_f64()
                .ok_or_else(|| AdapterError::new("TypeError", "expected an array of numbers"))
        })
        .collect()
}

fn assert_non_empty(values: &[f64]) -> Result<(), AdapterError> {
    if values.is_empty() {
        return Err(AdapterError::new(
            "RangeError",
            "statlib: input must not be empty",
        ));
    }
    Ok(())
}

fn sorted(values: &[f64]) -> Vec<f64> {
    let mut s = values.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    s
}

fn mean(values: &[f64]) -> Result<f64, AdapterError> {
    assert_non_empty(values)?;
    let mut sum = 0.0;
    for v in values {
        sum += v;
    }
    Ok(sum / values.len() as f64)
}

fn median(values: &[f64]) -> Result<f64, AdapterError> {
    assert_non_empty(values)?;
    let s = sorted(values);
    let mid = s.len() / 2;
    if s.len() % 2 == 1 {
        Ok(s[mid])
    } else {
        Ok((s[mid - 1] + s[mid]) / 2.0)
    }
}

fn percentile(values: &[f64], p: f64) -> Result<f64, AdapterError> {
    assert_non_empty(values)?;
    if !(0.0..=100.0).contains(&p) {
        return Err(AdapterError::new(
            "RangeError",
            "statlib: percentile p must be within [0, 100]",
        ));
    }
    let s = sorted(values);
    let rank = (p / 100.0) * (s.len() as f64 - 1.0);
    let lo = rank.floor() as usize;
    let frac = rank - lo as f64;
    if frac == 0.0 {
        return Ok(s[lo]);
    }
    Ok(s[lo] + frac * (s[lo + 1] - s[lo]))
}

fn stddev(values: &[f64]) -> Result<f64, AdapterError> {
    if values.len() < 2 {
        return Err(AdapterError::new(
            "RangeError",
            "statlib: stddev needs at least two values",
        ));
    }
    let m = mean(values)?;
    let mut sq = 0.0;
    for v in values {
        sq += (v - m) * (v - m);
    }
    Ok((sq / (values.len() as f64 - 1.0)).sqrt())
}

fn summarize(values: &[f64]) -> Result<Value, AdapterError> {
    assert_non_empty(values)?;
    let s = sorted(values);
    let sd = if values.len() >= 2 {
        json!(stddev(values)?)
    } else {
        Value::Null
    };
    Ok(json!({
        "count": values.len(),
        "min": s[0],
        "max": s[s.len() - 1],
        "mean": mean(values)?,
        "median": median(values)?,
        "p95": percentile(values, 95.0)?,
        "stddev": sd,
    }))
}

fn normalize(values: &[f64]) -> Result<Value, AdapterError> {
    let m = mean(values)?;
    let sd = stddev(values)?;
    let out: Vec<f64> = values.iter().map(|v| (v - m) / sd).collect();
    Ok(json!(out))
}

struct Statlib;

impl Adapter for Statlib {
    fn name(&self) -> &str {
        "statlib-rust-port"
    }

    fn invoke(&mut self, boundary: &str, args: Vec<Value>) -> Result<Value, AdapterError> {
        let export = boundary.split('#').nth(1).unwrap_or("");
        let first = args.first().cloned().unwrap_or(Value::Null);
        match export {
            "mean" => Ok(json!(mean(&nums(&first)?)?)),
            "median" => Ok(json!(median(&nums(&first)?)?)),
            "percentile" => {
                let p = args
                    .get(1)
                    .and_then(|v| v.as_f64())
                    .ok_or_else(|| AdapterError::new("TypeError", "expected a number for p"))?;
                Ok(json!(percentile(&nums(&first)?, p)?))
            }
            "stddev" => Ok(json!(stddev(&nums(&first)?)?)),
            "summarize" => summarize(&nums(&first)?),
            "normalize" => normalize(&nums(&first)?),
            other => Err(AdapterError::new(
                "ReferenceError",
                &format!("no implementation for boundary export {other}"),
            )),
        }
    }
}

fn main() -> std::io::Result<()> {
    serve(Statlib)
}
