const localtunnel = require('localtunnel');

(async () => {
    try {
        const tunnel = await localtunnel({ port: 3000 });
        console.log(`LOCALTUNNEL_URL=${tunnel.url}`);

        tunnel.on('close', () => {
            console.log('Tunnel closed');
        });
    } catch (err) {
        console.error('Error starting localtunnel:', err);
    }
})();
