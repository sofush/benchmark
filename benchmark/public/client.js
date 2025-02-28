const connectWebsocket = () => {
	const https = window.location.protocol === "https:";
	const uri = `${https ? 'wss:' : 'ws:'}//${window.location.host}/websocket`
	console.log(`Connecting to websocket at: ${uri}`)

	return new Promise((resolve, reject) => {
		const ws = new WebSocket(uri);

		ws.onopen = () => {
			resolve(ws);
		};

		ws.onerror = (err) => {
			reject(err);
		};
	});
};

const initBarChart = () => {
	const avgChartCtx = document.getElementById('avg-chart');
	const datasets = [
		{
			label: 'Rust',
			data: [{ x: 1, y: 22.8 }],
			backgroundColor: 'rgba(247, 76, 0, 0.2)',
			borderColor: 'rgba(255, 26, 104, 1)',
			borderWidth: 1,
			xAxisID: "x1",
			categoryPercentage: 1,
		},
		{
			label: 'Python + numpy',
			data: [{ x: 2, y: 75.3 }],
			backgroundColor: 'rgba(54, 162, 235, 0.2)',
			borderColor: 'rgba(54, 162, 235, 1)',
			borderWidth: 1,
			xAxisID: "x1",
			categoryPercentage: 1,
		},
		{
			label: 'Python',
			data: [{ x: 3, y: 5185.3 }],
			backgroundColor: 'rgba(54, 162, 235, 0.2)',
			borderColor: 'rgba(54, 162, 235, 1)',
			borderWidth: 1,
			xAxisID: "x1",
			categoryPercentage: 1,
		},
	];

	const config = {
		type: 'bar',
		data: { datasets },
		options: {
			plugins: {
				legend: true,
				tooltip: {
					callbacks: {
						title(tooltipItems) {
							if (tooltipItems.length) {
								const item = tooltipItems[0];
								const tick = item.chart.scales.x.ticks[item.datasetIndex];
								return tick.label;
							}
						},
						label: item => {
							const value = item.formattedValue;
							return `${value} ms`;
						}
					}
				}
			},
			scales: {
				x: {
					labels: ctx => datasets.map(ds => ds.label).filter(a => {
						const idx = datasets.findIndex(b => b.label == a);
						return ctx.chart.isDatasetVisible(idx);
					}),
				},
				x1: {
					display: false,
					offset: true
				},
				y: {
					beginAtZero: true,
					min: 0,
					grid: {
						drawOnChartArea: true
					}
				},
			}
		}
	};

	new Chart(avgChartCtx, config);
};

const initLineChart = () => {
	const rustChartCtx = document.getElementById('rust-chart');

	const annotation = {
		type: 'line',
		borderColor: '#a52b00',
		borderDash: [10, 20],
		borderDashOffset: 0,
		borderWidth: 3.0,
		label: {
			backgroundColor: '#a52b00',
			display: true,
			position: '15%'
		},
		scaleID: 'y',
	};

	return new Chart(rustChartCtx, {
		type: 'line',
		data: {
			labels: ['', '', '', '', '', '', '', '', '', ''],
			datasets: [{
				backgroundColor: 'rgb(247, 76, 0)',
				borderColor: 'rgba(247, 76, 0, 0.5)',
				data: [],
				borderWidth: 4.5,
				tension: 0.2,
				cubicInterpolationMode: 'default',
			}]
		},
		options: {
			responsive: true,
			animation: {
				duration: 200
			},
			plugins: {
				legend: false,
				annotation: {
					annotations: [
						annotation
					]
				}
			}
		}
	});
};

document.addEventListener('DOMContentLoaded', async _ => {
	const bar = initBarChart();
	const rust = initLineChart();

	const rustResults = [];

	let ws = null;

	try {
		ws = await connectWebsocket()
	} catch (e) {
		console.error(`Could not connect to websocket: ${e}`);
		return;
	}

	ws.onmessage = ev => {
		let msg = undefined;

		try {
			msg = JSON.parse(ev.data);
		} catch (e) {
			console.error(`Could not parse JSON from websocket message: ${e}`);
			return;
		}

		chart = undefined;
		results = undefined;

		switch (msg.server) {
			case 'rust':
				chart = rust;
				results = rustResults;
				break;
			case 'python':
				return;
			default:
				console.error(`Unrecognized server name: ${msg.server}`);
				return;
		}

		const elapsedMs = Math.round((msg.elapsed.secs * 1_000) + (msg.elapsed.nanos / 1_000_000));
		console.log(`Response from ${msg.server} server, benchmark took ${elapsedMs}ms`);

		results.push({
			filename: msg.filename,
			elapsedMs,
		});

		if (results.length > 100) {
			results.shift();
		}

		const dataset = results.slice(-10);
		chart.data.datasets[0].data = dataset.map(d => d.elapsedMs);
		chart.data.labels = dataset.map(d => d.filename);

		const calculateMedian = (input) => {
			const sorted = input.sort((a, b) => a - b);

			if (sorted.length === 0)
				return 0;

			if (sorted.length % 2 == 1) {
				const idx = Math.floor(sorted.length / 2);
				return sorted[idx];
			}

			const half = sorted.length / 2;
			const a = sorted[half - 1];
			const b = sorted[half];
			return (a + b) / 2;
		};

		const allElapsed = results.map(r => r.elapsedMs);
		const newMedian = Math.floor(calculateMedian(allElapsed));
		const step = 50;

		const roundStepped = (number, step, down) => {
			const out = Math.round(number / step) * step;
			return down ? out : out + step;
		};

		chart.options.scales.y.min = roundStepped(Math.min(...allElapsed), step, true) - step;
		chart.options.scales.y.max = roundStepped(Math.max(...allElapsed), step, false) + step;
		chart.options.plugins.annotation.annotations[0].label.content = `Median: ${newMedian}ms`;
		chart.options.plugins.annotation.annotations[0].value = newMedian;
		chart.update();
	};
});
