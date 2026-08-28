// The desktop entry point. Everything lives in lib.rs so `cargo test` and the
// mobile targets can reach it too.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tilde_lib::run()
}
