"use strict";

// Globals
let files = [];
let dataTable;
let clearBtn = document.getElementById('clear-results');
let resultsContainer = document.getElementById('results-container');

// — Dark mode toggle — 
document.addEventListener('DOMContentLoaded', () => {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const dark = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark-mode', dark);
    darkModeToggle.textContent = dark ? '☀️' : '🌙';

    darkModeToggle.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', isDark);
        darkModeToggle.textContent = isDark ? '☀️' : '🌙';
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
    fileInput.value = '';
    await doUpload();
});

fileInput.addEventListener('change', async () => {
    for (let f of fileInput.files) await processFile(f);
    fileInput.value = '';
    await doUpload();
});

async function processFile(file) {
    if (file.name.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        let validFileFound = false;

        for (let name of Object.keys(zip.files)) {
            const blob = await zip.files[name].async('blob');
            files.push(new File([blob], name, { type: 'text/csv' }));
            validFileFound = true;
        }

        if (!validFileFound) {
            alert(`ZIP file "${file.name}" contains no files.`);
        }
    } else {
        files.push(file);
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

        if (!res.ok) {
            throw new Error(`Server error (${res.status}): ${await res.text()}`);
        }

        const { results } = await res.json();

        const validResults = results.filter(r => !r.error);
        const errorResults = results.filter(r => r.error);

        if (validResults.length) {
            appendResults(validResults);
        }

        if (errorResults.length) {
            const failedFiles = [...new Set(
                errorResults.map(r =>
                    r.file_name.split(/[/\\]/).pop()
                )
            )];

            const failedFilesMsg = failedFiles.join("\n");
            if (failedFilesMsg.length) {
                alert(`The following file${failedFiles.length > 1 ? 's' : ''} failed to upload:\n\n` + failedFilesMsg);
            }
        }

        files = [];
    } catch (err) {
        alert('Could not upload files. Make sure you are uploading valid files (no folders)');
        files = [];
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