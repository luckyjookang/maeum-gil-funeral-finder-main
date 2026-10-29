(function (root) {
  const validPoint = (p) =>
    p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= 32 &&
    p.lat <= 39.5 &&
    p.lng >= 124 &&
    p.lng <= 132;
  function locate(rows, positions) {
    return rows.flatMap((row) => {
      const p = positions[row["주소"]];
      return validPoint(p) ? [{ id: row.id, lat: p.lat, lng: p.lng, row }] : [];
    });
  }
  function cluster(points, zoom, cellSize = 52) {
    const buckets = new Map(),
      scale = 256 * Math.pow(2, zoom);
    for (const p of points) {
      const sin = Math.sin((p.lat * Math.PI) / 180),
        x = ((p.lng + 180) / 360) * scale,
        y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
      const key = Math.floor(x / cellSize) + ":" + Math.floor(y / cellSize);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    }
    return [...buckets.values()].map((members) => ({
      members,
      lat: members.reduce((sum, p) => sum + p.lat, 0) / members.length,
      lng: members.reduce((sum, p) => sum + p.lng, 0) / members.length,
    }));
  }
  const api = { validPoint, locate, cluster };
  root.MaeumMapModel = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
