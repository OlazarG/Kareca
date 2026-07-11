module.exports = {
    apps: [{
        name: 'kareca-pos',
        script: 'server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        error_file: '/var/log/kareca/error.log',
        out_file: '/var/log/kareca/out.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
};
