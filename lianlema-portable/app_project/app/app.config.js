// Desktop Expo development keeps its original root; the server export lives under /lianlema.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.LIANLEMA_WEB_BASE_PATH
    ? { baseUrl: process.env.LIANLEMA_WEB_BASE_PATH } : {}) },
});
