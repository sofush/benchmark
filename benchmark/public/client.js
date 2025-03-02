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

const initRadarChart = () => {
	const radarChartCtx = document.getElementById('radar-chart');
	const data = {
		labels: [],
		datasets: [{
			label: 'Rust',
			data: [],
			fill: true,
			backgroundColor: 'rgba(255, 99, 132, 0.2)',
			borderColor: 'rgb(255, 99, 132)',
			pointBackgroundColor: 'rgb(255, 99, 132)',
			pointBorderColor: '#fff',
			pointHoverBackgroundColor: '#fff',
			pointHoverBorderColor: 'rgb(255, 99, 132)'
		}, {
			label: 'Python',
			data: [],
			fill: true,
			backgroundColor: 'rgba(54, 162, 235, 0.2)',
			borderColor: 'rgb(54, 162, 235)',
			pointBackgroundColor: 'rgb(54, 162, 235)',
			pointBorderColor: '#fff',
			pointHoverBackgroundColor: '#fff',
			pointHoverBorderColor: 'rgb(54, 162, 235)'
		}]
	};

	const config = {
		type: 'radar',
		data: data,
		options: {
			elements: {
				line: {
					borderWidth: 2
				}
			}
		},
	};

	return new Chart(radarChartCtx, config);
};

const initLineChart = (options) => {
	const chartCtx = document.getElementById(options.elementId);

	const annotation = {
		type: 'line',
		borderColor: options.annotationColor,
		borderDash: [10, 20],
		borderDashOffset: 0,
		borderWidth: 3.0,
		label: {
			backgroundColor: options.annotationColor,
			display: true,
			position: '15%'
		},
		scaleID: 'y',
	};

	return new Chart(chartCtx, {
		type: 'line',
		data: {
			labels: ['', '', '', '', '', '', '', '', '', ''],
			datasets: [{
				backgroundColor: options.background,
				borderColor: options.border,
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

const calculateMedian = (list) => {
	const sorted = list.sort((a, b) => a - b);

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

const updateLineChart = (chart, results) => {
	const dataset = results.slice(-10);
	chart.data.datasets[0].data = dataset.map(d => d.elapsedMs);
	chart.data.labels = dataset.map(d => d.filename);

	const allElapsed = results.map(r => r.elapsedMs);
	const newMedian = Math.floor(calculateMedian(allElapsed));
	const step = 50;

	const steppedRound = (number, step, down) => {
		const out = Math.round(number / step) * step;
		return down ? out : out + step;
	};

	chart.options.scales.y.min = steppedRound(Math.min(...allElapsed), step, true) - step;
	chart.options.scales.y.max = steppedRound(Math.max(...allElapsed), step, false) + step;
	chart.options.plugins.annotation.annotations[0].label.content = `Median: ${newMedian}ms`;
	chart.options.plugins.annotation.annotations[0].value = newMedian;
	chart.update();
};

const updateRadarChartDataset = (chart, lang, labels, results) => {
	const dataset = chart.data.datasets.find(ds => ds.label.toLowerCase() === lang.toLowerCase());
	dataset.data = [];

	for (const idx in labels) {
		const label = labels[idx];

		if (!(label in results))
			continue;

		const allElapsed = results[label];
		const median = calculateMedian(allElapsed);
		dataset.data.push(median);
	}
};

const updateRadarChart = (chart, rustResults, pythonResults) => {
	const labels = chart.data.labels;

	for (const key in rustResults) {
		if (!labels.includes(key)) {
			labels.push(key);
			labels.sort((a, b) => {
				const anum = parseInt(a);
				const bnum = parseInt(b);

				if (anum === NaN || bnum === NaN) {
					console.error('Filename does not start with a number.');
					return 0;
				}

				const sign = Math.sign(anum - bnum);
				return sign;
			});
		}
	}

	updateRadarChartDataset(chart, 'rust', labels, rustResults);
	updateRadarChartDataset(chart, 'python', labels, pythonResults);
	chart.update();
};

document.addEventListener('DOMContentLoaded', async _ => {
	const radar = initRadarChart();
	const rust = initLineChart({
		elementId: 'rust-chart',
		annotationColor: '#a52b00',
		background: 'rgb(247, 76, 0)',
		border: 'rgba(247, 76, 0, 0.5)',
	});
	const python = initLineChart({
		elementId: 'python-chart',
		annotationColor: '#4584b6',
		background: 'rgb(69, 132, 182)',
		border: 'rgba(69, 132, 182, 0.5)',
	});

	const rustLineResults = [];
	const pythonLineResults = [];
	const rustRadarResults = {};
	const pythonRadarResults = {};

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

		let chart = undefined;
		let lineResults = undefined;
		let radarResults = undefined;

		switch (msg.server) {
			case 'rust':
				chart = rust;
				lineResults = rustLineResults;
				radarResults = rustRadarResults;
				break;
			case 'python':
				chart = python;
				lineResults = pythonLineResults;
				radarResults = pythonRadarResults;
				break;
			default:
				console.error(`Unrecognized server name: ${msg.server}`);
				return;
		}

		const elapsedMs = Math.round((msg.elapsed.secs * 1_000) + (msg.elapsed.nanos / 1_000_000));
		// console.log(`Response from ${msg.server} server, benchmark took ${elapsedMs}ms`);

		lineResults.push({
			filename: msg.filename,
			elapsedMs,
		});

		radarResults[msg.filename] ??= [];
		radarResults[msg.filename].push(elapsedMs);

		if (lineResults.length > 1000) {
			lineResults.shift();
		}

		if (radarResults[msg.filename].length > 100) {
			radarResults[msg.filename].shift();
		}

		updateLineChart(chart, lineResults);
		updateRadarChart(radar, rustRadarResults, pythonRadarResults);
	};
});
