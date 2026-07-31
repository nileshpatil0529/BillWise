export const environment = {
  production: false,
  // Use current hostname so the app works from any device on the LAN
  apiUrl: `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3000/api`
};
