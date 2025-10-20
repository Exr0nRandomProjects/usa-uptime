import shutdownsCsv from '$lib/data/shutdowns_full.csv?raw';

export const prerender = true;

// Parse CSV data
const parseCSV = (text) => {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i];
    });
    return obj;
  });
};

// Check if there's an ongoing shutdown
const hasOngoingShutdown = (shutdowns) => {
  return shutdowns.some(s => !s.end_datetime_et);
};

export function GET() {
  const shutdowns = parseCSV(shutdownsCsv);
  const isDown = hasOngoingShutdown(shutdowns);
  
  return new Response(null, {
    status: isDown ? 503 : 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
      'CDN-Cache-Control': 'no-store'
    }
  });
}