.PHONY: rl-watch rl-snippets rl-train rl-telemetry

rl-watch:
	@echo "Watching for pending jump events..."
	python -m backend.rl.watch_snippets --batch 20 --interval 60

rl-snippets:
	@echo "Rendering a batch of pending jump events..."
	python -m backend.rl.generate_snippets --limit 25 --pre 2.0 --post 3.0

rl-train:
	@echo "Training RL jump-quality model..."
	python -m backend.rl.train_model

rl-telemetry:
	@python -m backend.rl.show_telemetry
