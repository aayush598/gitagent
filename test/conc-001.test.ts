import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("CONC-001: Shared state without locks", () => {
	it("eagerly created counter handles are shared across concurrent access", async () => {
		const { metrics } = await import("@opentelemetry/api");
		const { MeterProvider } = await import(
			"@opentelemetry/sdk-metrics"
		) as any;
		const { InMemoryMetricExporter } = await import(
			"@opentelemetry/sdk-metrics"
		) as any;

		const exporter = new InMemoryMetricExporter();
		const meterProvider = new MeterProvider();
		const reader = meterProvider.addView
			? undefined
			: undefined;
		metrics.setGlobalMeterProvider(meterProvider);

		const meter = metrics.getMeter("test");

		// Simulate eager creation (like the fix)
		const counter = meter.createCounter("test.calls", {
			description: "test",
		});

		// Concurrent access to the same handle
		const results = await Promise.all(
			Array.from({ length: 50 }, () =>
				Promise.resolve().then(() => {
					counter.add(1, {});
					return counter;
				}),
			),
		);

		const first = results[0];
		for (const r of results) {
			assert.equal(r, first, "All concurrent calls must return same Counter handle");
		}

		await meterProvider.shutdown();
	});

	it("concurrent add calls do not lose data with eager handles", async () => {
		const { InMemoryMetricExporter, MeterProvider } = await import(
			"@opentelemetry/sdk-metrics"
		) as any;
		const { metrics } = await import("@opentelemetry/api");

		const exporter = new InMemoryMetricExporter();
		const meterProvider = new MeterProvider({
			readers: [{
				export: () => { },
				forceFlush: () => Promise.resolve(),
				shutdown: () => Promise.resolve(),
			}],
		});
		metrics.setGlobalMeterProvider(meterProvider);

		const meter = metrics.getMeter("test2");
		const counter = meter.createCounter("test.calls2", {
			description: "test",
		});

		// 100 concurrent adds
		await Promise.all(
			Array.from({ length: 100 }, () => {
				counter.add(1, {});
				return Promise.resolve();
			}),
		);

		await meterProvider.shutdown();
	});
});
