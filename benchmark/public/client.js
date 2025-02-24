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

const initCharts = () => {
	initBarChart();

	const rustChartCtx = document.getElementById('rust-chart');

	const average = (ctx) => {
		const values = ctx.chart.data.datasets[0].data;
		return values.reduce((a, b) => a + b, 0) / values.length;
	};

	const annotation = {
		type: 'line',
		borderColor: '#a52b00',
		borderDash: [10, 20],
		borderDashOffset: 0,
		borderWidth: 3.0,
		label: {
			backgroundColor: '#a52b00',
			display: true,
			content: (ctx) => 'Gennemsnit: ' + average(ctx).toFixed(2) + 'ms',
			position: '15%'
		},
		scaleID: 'y',
		value: (ctx) => average(ctx)
	};

	new Chart(rustChartCtx, {
		type: 'line',
		data: {
			labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
			datasets: [{
				backgroundColor: 'rgb(247, 76, 0)',
				borderColor: 'rgba(247, 76, 0, 0.5)',
				data: [24.92, 24.22, 15.99, 19.29, 22.68, 19.22, 16.2, 17.22, 18.5, 18.91],
				borderWidth: 4.5,
				tension: 0.3,
				cubicInterpolationMode: 'monotone',
			}]
		},
		options: {
			responsive: true,
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
	let ws = null;

	try {
		ws = await connectWebsocket()
	} catch (e) {
		console.error(`Could not connect to websocket: ${e}`);
		return;
	}

	initCharts();
});
