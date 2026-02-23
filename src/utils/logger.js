// logger.js
export function setupScreenLogger() {
    const loggerDiv = document.createElement('div');
    loggerDiv.id = 'screen-logger';
    loggerDiv.style.position = 'fixed';
    loggerDiv.style.bottom = '0';
    loggerDiv.style.left = '0';
    loggerDiv.style.width = '100vw';
    loggerDiv.style.height = '300px';
    loggerDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    loggerDiv.style.color = 'lime';
    loggerDiv.style.overflowY = 'auto';
    loggerDiv.style.zIndex = '999999';
    loggerDiv.style.fontFamily = 'monospace';
    loggerDiv.style.padding = '10px';
    loggerDiv.style.pointerEvents = 'none';
    document.body.appendChild(loggerDiv);

    const oldLog = console.log;
    const oldError = console.error;

    console.log = function (...args) {
        oldLog(...args);
        const p = document.createElement('div');
        p.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        loggerDiv.appendChild(p);
        loggerDiv.scrollTop = loggerDiv.scrollHeight;
    };

    console.error = function (...args) {
        oldError(...args);
        const p = document.createElement('div');
        p.style.color = 'red';
        p.textContent = 'ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        loggerDiv.appendChild(p);
        loggerDiv.scrollTop = loggerDiv.scrollHeight;
    };

    window.onerror = function (msg, url, lineNo, columnNo, error) {
        console.error(msg, url, lineNo, columnNo, error);
        return false;
    };

    window.addEventListener('unhandledrejection', function (event) {
        console.error('Unhandled Rejection:', event.reason);
    });
}
