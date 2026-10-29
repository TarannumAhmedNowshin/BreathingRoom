// OWNER: Person 3 — Open-Meteo, free, no API key.
export async function getWeather(city = { lat: 53.3498, lon: -6.2603 }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,precipitation`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const c = (await res.json()).current;
  return { tempC: Math.round(c.temperature_2m), dry: (c.precipitation ?? 0) < 0.1 };
}
