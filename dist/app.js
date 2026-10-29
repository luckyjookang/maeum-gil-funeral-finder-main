const $ = (id) => document.getElementById(id);
let data = [],
  filtered = [],
  shown = 30,
  selected = null;
const escapeHTML = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const short = (s) =>
  s
    .replace("특별자치도", "")
    .replace("특별자치시", "")
    .replace("특별시", "")
    .replace("광역시", "")
    .replace("경기도", "경기")
    .replace("충청북도", "충북")
    .replace("충청남도", "충남")
    .replace("전라남도", "전남")
    .replace("경상북도", "경북")
    .replace("경상남도", "경남");
let naverMap = null,
  mapMarkers = [],
  mapInfo = null,
  positions = {},
  mapPoints = [],
  mapFrame = 0,
  mapReadyAttempts = 0,
  coordinateFailed = false;
const { locate, cluster } = window.MaeumMapModel;
const emptyDetail = $("detail").innerHTML;
function mapUnavailable(message) {
  $("map").hidden = true;
  $("naverFallback").hidden = false;
  $("mapStatus").textContent = message;
}
function showMap() {
  $("map").hidden = false;
  $("naverFallback").hidden = true;
  naverMap.setSize(
    new naver.maps.Size($("map").clientWidth, $("map").clientHeight),
  );
}
function resultLocation() {
  return (
    [$("region").value, $("district").value].filter(Boolean).join(" ") || "전국"
  );
}
function updateMapLinks(q) {
  const url = "https://map.naver.com/p/search/" + encodeURIComponent(q);
  $("mapFallback").href = url;
  $("naverOpen").href = url;
  $("naverPlace").textContent = q;
}
function clearMapMarkers() {
  for (const marker of mapMarkers) {
    naver.maps.Event.clearInstanceListeners(marker);
    marker.setMap(null);
  }
  mapMarkers = [];
}
function setMapSummary() {
  const missing = filtered.length - mapPoints.length;
  $("mapSummary").textContent = coordinateFailed
    ? "지도 위치 데이터를 불러오지 못했습니다. 새로고침해 주세요."
    : !filtered.length
      ? "검색 결과가 없습니다."
      : resultLocation() +
        " · " +
        mapPoints.length.toLocaleString() +
        "곳 표시" +
        (missing ? " · 위치 미확인 " + missing.toLocaleString() + "곳" : "") +
        " · 숫자를 누르면 확대";
}
function drawMapMarkers() {
  if (!naverMap) return;
  clearMapMarkers();
  const zoom = naverMap.getZoom(),
    showNames = zoom >= 14,
    groups = cluster(mapPoints, zoom);
  for (const group of groups) {
    const count = group.members.length,
      point = new naver.maps.LatLng(group.lat, group.lng),
      r = group.members[0].row;
    const name = r["시설명"] + (count > 1 ? " 외 " + (count - 1) + "곳" : ""),
      title = showNames
        ? name
        : count > 1
          ? "장례식장 " + count + "곳, 클릭하여 확대"
          : r["시설명"];
    const content = showNames
      ? `<button type="button" class="map-name-label ${group.members.some((p) => p.id === selected) ? "selected" : ""}" aria-label="${escapeHTML(title)}" title="${escapeHTML(title)}"><span>${escapeHTML(name)}</span></button>`
      : count > 1
        ? `<button type="button" class="map-cluster" aria-label="${escapeHTML(title)}">${count}</button>`
        : `<button type="button" class="map-pin ${selected === r.id ? "selected" : ""}" aria-label="${escapeHTML(title)}"><span aria-hidden="true">●</span></button>`;
    const marker = new naver.maps.Marker({
      map: naverMap,
      position: point,
      title,
      zIndex: group.members.some((p) => p.id === selected)
        ? 1000
        : showNames
          ? 100
          : 0,
      icon: {
        content,
        size: new naver.maps.Size(
          showNames ? 180 : count > 1 ? 42 : 28,
          showNames ? 50 : count > 1 ? 42 : 28,
        ),
        anchor: new naver.maps.Point(
          showNames ? 90 : count > 1 ? 21 : 14,
          showNames ? 50 : count > 1 ? 21 : 14,
        ),
      },
    });
    naver.maps.Event.addListener(marker, "click", () => {
      if (count === 1) {
        choose(r.id);
        return;
      }
      if (naverMap.getZoom() >= 17) {
        mapInfo.setContent(
          '<div class="map-place-list"><b>이 위치의 장례식장 ' +
            count +
            "곳</b>" +
            group.members
              .map(
                (p) =>
                  `<button type="button" data-map-id="${p.id}">${escapeHTML(p.row["시설명"])}</button>`,
              )
              .join("") +
            "</div>",
        );
        mapInfo.open(naverMap, marker);
        return;
      }
      const bounds = new naver.maps.LatLngBounds();
      group.members.forEach((p) =>
        bounds.extend(new naver.maps.LatLng(p.lat, p.lng)),
      );
      const zoom = naverMap.getZoom();
      naverMap.fitBounds(bounds, { top: 55, right: 55, bottom: 55, left: 55 });
      if (naverMap.getZoom() <= zoom) naverMap.setZoom(zoom + 2);
      if (naverMap.getZoom() > 17) naverMap.setZoom(17);
    });
    mapMarkers.push(marker);
  }
}
function scheduleMapDraw() {
  cancelAnimationFrame(mapFrame);
  mapFrame = requestAnimationFrame(drawMapMarkers);
}
function fitMapResults() {
  if (!naverMap) return;
  showMap();
  mapInfo.close();
  if (!mapPoints.length) {
    naverMap.setCenter(new naver.maps.LatLng(36.4, 127.8));
    naverMap.setZoom(7);
    return;
  }
  const bounds = new naver.maps.LatLngBounds();
  mapPoints.forEach((p) => bounds.extend(new naver.maps.LatLng(p.lat, p.lng)));
  naverMap.fitBounds(bounds, { top: 45, right: 45, bottom: 55, left: 45 });
  if (naverMap.getZoom() > 16) naverMap.setZoom(16);
  scheduleMapDraw();
}
function syncMapResults() {
  mapPoints = locate(filtered, positions);
  updateMapLinks(resultLocation() + " 장례식장");
  $("mapLabel").textContent = resultLocation();
  setMapSummary();
  if (!naverMap) return;
  clearMapMarkers();
  fitMapResults();
  scheduleMapDraw();
}
function focusFacility(r) {
  updateMapLinks(r["시설명"] + " " + r["주소"]);
  $("mapLabel").textContent = r["시설명"];
  if (!naverMap) return;
  const p = positions[r["주소"]];
  mapInfo.close();
  if (!window.MaeumMapModel.validPoint(p)) {
    $("mapSummary").textContent =
      "이 시설의 위치를 확인하지 못했습니다. 큰 지도에서 주소를 검색해 주세요.";
    return;
  }
  showMap();
  naverMap.setCenter(new naver.maps.LatLng(p.lat, p.lng));
  naverMap.setZoom(17);
  scheduleMapDraw();
}
window.navermap_authFailure = () => {
  naverMap = null;
  mapUnavailable(
    "사이트 내 지도를 연결하지 못했습니다. 네이버 지도에서 확인해 주세요.",
  );
};
window.initNaverMap = () =>
  setTimeout(() => {
    if (!window.naver?.maps?.Map) {
      if (++mapReadyAttempts < 100) {
        window.initNaverMap();
        return;
      }
      window.navermap_authFailure();
      return;
    }
    try {
      $("map").hidden = false;
      $("naverFallback").hidden = true;
      naverMap = new naver.maps.Map("map", {
        center: new naver.maps.LatLng(36.4, 127.8),
        zoom: 7,
        zoomControl: true,
      });
      mapInfo = new naver.maps.InfoWindow({
        borderWidth: 0,
        backgroundColor: "#ffffff",
      });
      naver.maps.Event.addListener(naverMap, "idle", scheduleMapDraw);
      window.addEventListener("resize", () => {
        showMap();
        scheduleMapDraw();
      });
      syncMapResults();
    } catch (error) {
      console.error(error);
      window.navermap_authFailure();
    }
  }, 100);
if (window.MAEUM_MAP_CONFIG?.clientId) {
  const script = document.createElement("script");
  script.src =
    "https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=" +
    encodeURIComponent(window.MAEUM_MAP_CONFIG.clientId);
  script.onload = window.initNaverMap;
  script.onerror = window.navermap_authFailure;
  document.head.append(script);
}
$("mapFit").onclick = () => {
  selected = null;
  render();
  $("mapLabel").textContent = resultLocation();
  setMapSummary();
  fitMapResults();
};
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-map-id]");
  if (button) choose(Number(button.dataset.mapId));
});

function setRegion(value) {
  $("region").value = value;
  $("district").innerHTML =
    '<option value="">전체 시·군·구</option>' +
    [
      ...new Set(
        data
          .filter((r) => !value || r["시도"] === value)
          .map((r) => r["시군구"]),
      ),
    ]
      .sort((a, b) => a.localeCompare(b, "ko"))
      .map((x) => `<option>${escapeHTML(x)}</option>`)
      .join("");
  apply();
}
function apply() {
  const q = $("query").value.trim().toLowerCase(),
    region = $("region").value,
    district = $("district").value,
    type = $("type").value;
  filtered = data.filter(
    (r) =>
      (!region || r["시도"] === region) &&
      (!district || r["시군구"] === district) &&
      (!type || r["공-사설구분"] === type) &&
      (!q ||
        (r["시설명"] + " " + r["주소"] + " " + r["시도"])
          .toLowerCase()
          .includes(q)),
  );
  selected = null;
  shown = 30;
  $("detail").innerHTML = emptyDetail;
  $("count").textContent = filtered.length.toLocaleString() + "개";
  $("resultTitle").textContent = (region || "전국") + " 장례식장";
  document
    .querySelectorAll(".chip")
    .forEach((b) => b.classList.toggle("active", b.dataset.region === region));
  render();
  syncMapResults();
}
function render() {
  $("list").innerHTML =
    filtered
      .slice(0, shown)
      .map(
        (r) =>
          `<button class="card ${selected === r.id ? "active" : ""}" data-id="${r.id}"><span class="tag">${escapeHTML(r["시도"])} · ${escapeHTML(r["시군구"])}</span><span class="tag">${escapeHTML(r["공-사설구분"])}</span><h4>${escapeHTML(r["시설명"])}</h4><p>${escapeHTML(r["주소"])}</p><p>빈소 ${escapeHTML(r["빈소수"] || "미기재")}개 · ${escapeHTML(r["전화번호"] || "연락처 미기재")}</p><div class="card-bottom"><span>가격 확인 필요</span><b>위치·상세 보기 ↗</b></div></button>`,
      )
      .join("") ||
    '<p class="empty">검색 결과가 없습니다.<br>다른 지역이나 이름으로 검색해 보세요.</p>';
  $("more").hidden = shown >= filtered.length;
}
function choose(id) {
  const r = data[id];
  selected = id;
  render();
  const q = r["시설명"] + " " + r["주소"];
  focusFacility(r);
  const tel = r["전화번호"].replace(/[^0-9+]/g, "");
  let homepage = "";
  try {
    const u = new URL(
      /^https?:\/\//i.test(r["홈페이지"])
        ? r["홈페이지"]
        : "https://" + r["홈페이지"],
    );
    if (r["홈페이지"] && ["http:", "https:"].includes(u.protocol))
      homepage = u.href;
  } catch {}
  $("detail").innerHTML =
    `<div class="eyebrow">${escapeHTML(r["공-사설구분"])} · ${escapeHTML(r["운영종류"])}</div><h3>${escapeHTML(r["시설명"])}</h3><p>${escapeHTML(r["주소"])}</p><div class="detail-grid"><div>빈소<b>${escapeHTML(r["빈소수"] || "미기재")}개</b></div><div>주차 가능<b>${escapeHTML(r["주차가능대수"] || "미기재")}대</b></div><div>안치 가능<b>${escapeHTML(r["안치가능구수"] || "미기재")}구</b></div></div><div class="actions">${tel ? `<a href="tel:${tel}">전화 ${escapeHTML(r["전화번호"])}</a>` : ""}<a href="https://map.naver.com/p/search/${encodeURIComponent(q)}" target="_blank" rel="noopener">네이버 지도 ↗</a>${homepage ? `<a href="${escapeHTML(homepage)}" target="_blank" rel="noopener">홈페이지 ↗</a>` : ""}</div><p class="price-note">빈소료·안치료·식사비: <b>확인 필요</b><br>가격 자료 미연동 · 시설에 항목별 견적을 요청해 주세요.</p>`;
  if (innerWidth < 801)
    $("mapPanel").scrollIntoView({ behavior: "smooth", block: "center" });
}
$("list").addEventListener("click", (e) => {
  const c = e.target.closest("[data-id]");
  if (c) choose(Number(c.dataset.id));
});
$("searchForm").onsubmit = (e) => {
  e.preventDefault();
  apply();
};
$("query").addEventListener("input", apply);
$("region").onchange = () => setRegion($("region").value);
$("district").onchange = apply;
$("type").onchange = apply;
$("more").onclick = () => {
  shown += 30;
  render();
};
$("reset").onclick = () => {
  $("query").value = "";
  $("type").value = "";
  setRegion("");
};
$("chips").onclick = (e) => {
  const b = e.target.closest("[data-region]");
  if (b) setRegion(b.dataset.region);
};
Promise.all([
  fetch("facilities.json").then((r) => {
    if (!r.ok) throw Error();
    return r.json();
  }),
  fetch("facility-coordinates.json")
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .catch(() => {
      coordinateFailed = true;
      return { positions: {} };
    }),
])
  .then(([rows, coordinates]) => {
    positions = coordinates.positions;
    data = rows.map((r, id) => ({ ...r, id }));
    const regions = [...new Set(data.map((r) => r["시도"]))];
    $("region").innerHTML += [...regions]
      .map((x) => `<option>${escapeHTML(x)}</option>`)
      .join("");
    $("chips").innerHTML = ["", ...regions]
      .map(
        (x) =>
          `<button class="chip" data-region="${escapeHTML(x)}">${x ? short(x) : "전국"} <small>${x ? data.filter((r) => r["시도"] === x).length : data.length}</small></button>`,
      )
      .join("");
    setRegion("");
  })
  .catch(() => {
    $("count").textContent = "불러오기 실패";
    $("list").innerHTML =
      "<p>목록을 불러오지 못했습니다. 새로고침해 주세요.</p>";
  });
