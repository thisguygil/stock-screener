"use strict";

// Globals
let files = [];
let dataTable;
let clearBtn = document.getElementById('clear-results');
let resultsContainer = document.getElementById('results-container');

// — Dark mode toggle — 
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('dark-mode-toggle');
    const dark = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark-mode', dark);
    toggle.textContent = dark ? '☀️' : '🌙';

    toggle.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', isDark);
        toggle.textContent = isDark ? '☀️' : '🌙';
    });

    // Initialize empty DataTable immediately
    dataTable = $('#resultsTable').DataTable({
        responsive: true,
        pageLength: 10,
        lengthMenu: [
            [5, 10, 25, 50, 100, -1],   // Values
            [5, 10, 25, 50, 100, "All"] // Labels
        ],
        columnDefs: [{ orderable: false, targets: 12 }] // Disable sorting on the column with ❌'s
    });
});

// — Drop‐zone & file parsing — 
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e =>
    dropZone.addEventListener(e, ev => {
        ev.preventDefault(); ev.stopPropagation();
        dropZone.classList[e.startsWith('dragl') ? 'remove' : 'add']('dragover');
    })
);

dropZone.addEventListener('drop', async e => {
    const dt = e.dataTransfer;
    for (let f of dt.files) await processFile(f);
    fileInput.value = '';       // clear selection
    await doUpload();           // auto‐upload on drop
});

fileInput.addEventListener('change', async () => {
    for (let f of fileInput.files) await processFile(f);
    fileInput.value = '';
    await doUpload();           // auto‐upload on select
});

async function processFile(file) {
    if (file.name.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        for (let name of Object.keys(zip.files)) {
            if (name.endsWith('.csv')) {
                const blob = await zip.files[name].async('blob');
                files.push(new File([blob], name, { type: 'text/csv' }));
            }
        }
    } else if (file.name.endsWith('.csv')) {
        files.push(file);
    } else {
        alert(`Unsupported type: ${file.name}`);
    }
}

// — Upload & append to table — 
async function doUpload() {
    if (!files.length) return;
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));

    try {
        const res = await fetch('/', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd
        });
        const { results } = await res.json();
        appendResults(results);
        files = [];
    } catch (err) {
        alert('Upload error: ' + err);
    }
}

function appendResults(results) {
    results.forEach(r => {
        const link = r.chart_link !== 'N/A'
            ? `<a href="${r.chart_link}" target="_blank">${r.file_name}</a>`
            : r.file_name;

        // Create a tr with the proper class on the last td
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${link}</td>
            <td>${r.std_dev}</td>
            <td>${r.large_changes}</td>
            <td>${r.avg_daily_return}</td>
            <td>${r.annual_volatility}</td>
            <td>${r.sharpe_ratio}</td>
            <td>${r.max_drawdown}</td>
            <td>${r.positive_days}</td>
            <td>${r.moving_average}</td>
            <td>${r.bollinger_pctB}</td>
            <td>${r.rsi}</td>
            <td>${r.volume_spikes}</td>
            <td class="action-col"><button class="remove-btn">❌</button></td>
        `;
        // Add the entire <tr> node so DataTables preserves the class
        dataTable.row.add(tr);
    });
    dataTable.draw(false);
    updateResultsVisibility();
}

// — Row‑remove handler — 
$('#resultsTable tbody').on('click', '.remove-btn', function () {
    dataTable.row($(this).closest('tr')).remove().draw();
    updateResultsVisibility();
});

// — Clear button handler —
clearBtn.addEventListener('click', () => {
    dataTable.clear().draw();
    updateResultsVisibility();
});

// — Results visibility handler —
function updateResultsVisibility() {
    const hasRows = dataTable.rows().count() > 0;
    resultsContainer.style.display = hasRows ? 'block' : 'none';
}