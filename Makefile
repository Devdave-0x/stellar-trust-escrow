.PHONY: bench coverage build build-optimized wasm-size

bench:
	cargo bench -p escrow_contract

coverage:
	cargo tarpaulin --config tarpaulin.toml --out Html --out Xml --output-dir target/tarpaulin

build:
	cargo build --target wasm32-unknown-unknown --release

build-optimized: build
	@mkdir -p target/wasm32-unknown-unknown/optimized
	@for wasm in target/wasm32-unknown-unknown/release/*.wasm; do \
		name=$$(basename $$wasm); \
		wasm-opt -Oz "$$wasm" -o "target/wasm32-unknown-unknown/optimized/$$name"; \
		echo "$$name: $$(wc -c < "target/wasm32-unknown-unknown/optimized/$$name") bytes"; \
	done

wasm-size: build
	@echo "--- Compiled WASM sizes ---"
	@for wasm in target/wasm32-unknown-unknown/release/*.wasm; do \
		name=$$(basename $$wasm); \
		size=$$(wc -c < "$$wasm"); \
		echo "$$name: $$size bytes ($$(( size / 1024 )) KB)"; \
	done
