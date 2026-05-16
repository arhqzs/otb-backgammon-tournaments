(function () {
  "use strict";

  const els = {
    search: document.getElementById("search"),
    region: document.getElementById("region"),
    country: document.getElementById("country"),
    month: document.getElementById("month"),
    format: document.getElementById("format"),
    prizeTier: document.getElementById("prize-tier"),
    feeMax: document.getElementById("fee-max"),
    upcomingOnly: document.getElementById("upcoming-only"),
    sort: document.getElementById("sort"),
    resetBtn: document.getElementById("reset-filters"),
    nearMeBtn: document.getElementById("near-me-btn"),
    geoStatus: document.getElementById("geo-status"),
    cards: document.getElementById("cards"),
    resultCount: document.getElementById("result-count"),
    sortLabel: document.getElementById("sort-label"),
    overlay: document.getElementById("detail-overlay"),
    detailBody: document.getElementById("detail-body"),
    closeDetail: document.getElementById("close-detail"),
    tabs: document.querySelectorAll(".tab"),
    tabPanels: document.querySelectorAll(".tab-panel"),
    videosContainer: document.getElementById("videos-container"),
  };

  let userLocation = null;
  let markers = {};
  let map;
  let userMarker;

  /* ---------- Init filter options ---------- */
  function populateFilterOptions() {
    const regions = [...new Set(TOURNAMENTS.map(t => t.region))].sort();
    const countries = [...new Set(TOURNAMENTS.map(t => t.country))].sort();

    regions.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      els.region.appendChild(opt);
    });

    countries.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      els.country.appendChild(opt);
    });
  }

  /* ---------- Map ---------- */
  function initMap() {
    map = L.map("map", { worldCopyJump: true }).setView([35, 10], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    TOURNAMENTS.forEach(t => {
      const marker = L.marker([t.lat, t.lng]).addTo(map);
      marker.bindPopup(buildPopupHtml(t));
      marker.on("click", () => {
        const card = document.getElementById("card-" + t.id);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      markers[t.id] = marker;
    });
  }

  function buildPopupHtml(t) {
    return `
      <div style="min-width:200px;">
        <strong>${escapeHtml(t.name)}</strong><br/>
        <span style="color:#5c4f42;font-size:12px;">${escapeHtml(t.city)}, ${escapeHtml(t.country)}</span><br/>
        <span style="font-size:12px;">${formatDateRange(t.startDate, t.endDate)}</span><br/>
        <button onclick="window.openTournamentDetail('${t.id}')" style="margin-top:6px;padding:5px 10px;background:#8b1e1e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">View details</button>
      </div>
    `;
  }

  /* ---------- Filtering ---------- */
  function getFiltered() {
    const q = els.search.value.trim().toLowerCase();
    const region = els.region.value;
    const country = els.country.value;
    const month = els.month.value ? parseInt(els.month.value, 10) : null;
    const format = els.format.value;
    const prizeMin = els.prizeTier.value ? parseInt(els.prizeTier.value, 10) : null;
    const feeMax = els.feeMax.value ? parseFloat(els.feeMax.value) : null;
    const upcomingOnly = els.upcomingOnly.checked;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let list = TOURNAMENTS.filter(t => {
      if (q) {
        const hay = `${t.name} ${t.city} ${t.country} ${t.venue}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (region && t.region !== region) return false;
      if (country && t.country !== country) return false;
      if (month !== null) {
        const m = new Date(t.startDate).getMonth() + 1;
        if (m !== month) return false;
      }
      if (format && t.format !== format) return false;
      if (prizeMin !== null && t.prizePoolUSD < prizeMin) return false;
      if (feeMax !== null && t.entryFeeUSD > feeMax) return false;
      if (upcomingOnly) {
        const end = new Date(t.endDate);
        if (end < today) return false;
      }
      return true;
    });

    if (userLocation) {
      list.forEach(t => {
        t._distanceKm = haversineKm(userLocation.lat, userLocation.lng, t.lat, t.lng);
      });
    } else {
      list.forEach(t => { t._distanceKm = null; });
    }

    const sortBy = els.sort.value;
    if (sortBy === "date") {
      list.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    } else if (sortBy === "prize") {
      list.sort((a, b) => b.prizePoolUSD - a.prizePoolUSD);
    } else if (sortBy === "fee") {
      list.sort((a, b) => a.entryFeeUSD - b.entryFeeUSD);
    } else if (sortBy === "distance" && userLocation) {
      list.sort((a, b) => a._distanceKm - b._distanceKm);
    }

    return list;
  }

  /* ---------- Rendering ---------- */
  function render() {
    const list = getFiltered();
    els.cards.innerHTML = "";
    els.resultCount.textContent = list.length;

    const sortBy = els.sort.value;
    els.sortLabel.textContent = sortBy === "distance" && userLocation
      ? "• sorted by distance"
      : sortBy === "prize"
      ? "• sorted by prize"
      : sortBy === "fee"
      ? "• sorted by entry fee"
      : "• sorted by date";

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "no-results";
      empty.textContent = "No tournaments match your filters. Try resetting them.";
      els.cards.appendChild(empty);
      return;
    }

    list.forEach(t => els.cards.appendChild(buildCard(t)));

    // dim non-matching markers
    const matchedIds = new Set(list.map(t => t.id));
    Object.entries(markers).forEach(([id, m]) => {
      m.setOpacity(matchedIds.has(id) ? 1 : 0.25);
    });
  }

  function buildCard(t) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = "card-" + t.id;
    card.tabIndex = 0;

    const distHtml = t._distanceKm != null
      ? `<span class="tag distance">${formatDistance(t._distanceKm)}</span>`
      : "";

    card.innerHTML = `
      <div class="card-title">${escapeHtml(t.name)}</div>
      <div class="card-location">${escapeHtml(t.city)}, ${escapeHtml(t.country)}</div>
      <div class="card-meta">
        <span class="tag date">${formatDateRange(t.startDate, t.endDate)}</span>
        <span class="tag prize">$${formatNum(t.prizePoolUSD)} prize</span>
        ${distHtml}
      </div>
      <div class="card-row"><span>Entry fee</span><strong>$${formatNum(t.entryFeeUSD)} USD</strong></div>
      <div class="card-row"><span>Format</span><strong>${escapeHtml(t.format)}</strong></div>
    `;

    card.addEventListener("click", () => openDetail(t.id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail(t.id);
      }
    });

    return card;
  }

  /* ---------- Detail panel ---------- */
  function openDetail(id) {
    const t = TOURNAMENTS.find(x => x.id === id);
    if (!t) return;

    const distLine = t._distanceKm != null
      ? `<div><strong>Distance</strong>${formatDistance(t._distanceKm)} away</div>`
      : "";

    els.detailBody.innerHTML = `
      <h2 id="detail-title" class="detail-title">${escapeHtml(t.name)}</h2>
      <div class="detail-sub">${escapeHtml(t.venue)} — ${escapeHtml(t.city)}, ${escapeHtml(t.country)}</div>

      <div class="detail-grid">
        <div><strong>Dates</strong>${formatDateRange(t.startDate, t.endDate, true)}</div>
        <div><strong>Format</strong>${escapeHtml(t.format)}</div>
        <div><strong>Entry fee</strong>$${formatNum(t.entryFeeUSD)} USD (local: ${escapeHtml(t.currency)})</div>
        <div><strong>Prize pool</strong>$${formatNum(t.prizePoolUSD)} USD (typical)</div>
        <div><strong>Clock</strong>${t.clockUsed ? "Used" : "Not used"}</div>
        <div><strong>Languages</strong>${t.languages.map(escapeHtml).join(", ")}</div>
        ${distLine}
      </div>

      <div class="detail-section">
        <h3>Divisions / events</h3>
        <ul>${t.divisions.map(d => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
      </div>

      <div class="detail-section">
        <h3>Requirements</h3>
        <p>${escapeHtml(t.requirements)}</p>
      </div>

      <div class="detail-section">
        <h3>Payment</h3>
        <p>${escapeHtml(t.payment)}</p>
      </div>

      <div class="detail-section">
        <h3>Notes</h3>
        <p>${escapeHtml(t.notes)}</p>
      </div>

      <div class="detail-section">
        <a href="${escapeAttr(t.website)}" target="_blank" rel="noopener" class="detail-cta">
          Sign up on official site →
        </a>
      </div>

      <div class="detail-warning">
        ⚠ Dates, fees, and format change each edition. Confirm everything on the official website before paying.
      </div>
    `;

    els.overlay.classList.remove("hidden");
    els.overlay.setAttribute("aria-hidden", "false");

    // also center map on this tournament
    if (map && markers[id]) {
      map.setView([t.lat, t.lng], Math.max(map.getZoom(), 5));
      markers[id].openPopup();
    }
  }

  function closeDetail() {
    els.overlay.classList.add("hidden");
    els.overlay.setAttribute("aria-hidden", "true");
  }

  // expose for the leaflet popup buttons
  window.openTournamentDetail = openDetail;

  /* ---------- Geolocation ---------- */
  function requestLocation() {
    if (!navigator.geolocation) {
      els.geoStatus.textContent = "Geolocation not supported";
      return;
    }
    els.geoStatus.textContent = "Locating...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        els.geoStatus.textContent = `📍 ${userLocation.lat.toFixed(2)}, ${userLocation.lng.toFixed(2)}`;

        // enable distance sort option
        const distOpt = els.sort.querySelector('option[value="distance"]');
        if (distOpt) distOpt.disabled = false;
        els.sort.value = "distance";

        // marker
        if (userMarker) map.removeLayer(userMarker);
        const icon = L.divIcon({ className: "you-are-here", iconSize: [16, 16] });
        userMarker = L.marker([userLocation.lat, userLocation.lng], { icon }).addTo(map);
        userMarker.bindPopup("You are here");
        map.setView([userLocation.lat, userLocation.lng], 4);

        render();
      },
      (err) => {
        els.geoStatus.textContent = "Location denied";
        console.warn(err);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }

  /* ---------- Helpers ---------- */
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function formatDistance(km) {
    if (km < 100) return `${Math.round(km)} km`;
    if (km < 1000) return `${Math.round(km / 10) * 10} km`;
    return `${Math.round(km / 100) / 10}k km`;
  }

  function formatDateRange(startStr, endStr, longForm) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const opts = longForm
      ? { year: "numeric", month: "long", day: "numeric" }
      : { month: "short", day: "numeric" };
    const yearOpt = { year: "numeric" };
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = start.getMonth() === end.getMonth() && sameYear;

    if (longForm) {
      return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
    }
    if (sameMonth) {
      return `${start.toLocaleDateString(undefined, opts)}–${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}, ${end.getFullYear()}`;
  }

  function formatNum(n) {
    return n.toLocaleString("en-US");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  /* ---------- Videos tab ---------- */
  function renderVideos() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    const buckets = { live: [], justEnded: [], comingUp: [], other: [] };

    TOURNAMENTS.forEach(t => {
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      if (today >= start && today <= end) {
        buckets.live.push(t);
      } else if (today > end && (today - end) <= 14 * dayMs) {
        buckets.justEnded.push(t);
      } else if (today < start && (start - today) <= 14 * dayMs) {
        buckets.comingUp.push(t);
      } else if (today < start) {
        buckets.other.push(t);
      }
    });

    buckets.justEnded.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
    buckets.comingUp.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    buckets.other.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const sections = [
      { key: "live", title: "Running today", badge: true, empty: "No tournaments are running today. Check the upcoming list below." },
      { key: "justEnded", title: "Just ended (last 14 days)", empty: null },
      { key: "comingUp", title: "Coming up (next 14 days)", empty: null },
      { key: "other", title: "Later this year", empty: null },
    ];

    let html = "";
    sections.forEach(sec => {
      const list = buckets[sec.key];
      if (list.length === 0 && !sec.empty) return;
      html += `
        <div class="video-section">
          <div class="video-section-header">
            <h3>${escapeHtml(sec.title)}</h3>
            ${sec.badge && list.length > 0 ? '<span class="badge-live">Live</span>' : ""}
            <span class="count">${list.length} tournament${list.length === 1 ? "" : "s"}</span>
          </div>
          ${list.length === 0
            ? `<div class="video-empty">${escapeHtml(sec.empty)}</div>`
            : `<div class="video-grid">${list.map(buildVideoCard).join("")}</div>`}
        </div>
      `;
    });

    html += `<div class="video-footnote">
      📺 Buttons open YouTube searches and channels in a new tab — results show whatever was actually uploaded, including same-day livestreams if the organizer is streaming.
      Coverage depends on the tournament: Monte Carlo, Nordic Open, and events streamed by Backgammon Galaxy are most reliable.
    </div>`;

    els.videosContainer.innerHTML = html;
  }

  function buildVideoCard(t) {
    const year = new Date(t.startDate).getFullYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const isLive = today >= start && today <= end;

    const searchUrl = "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(`${t.name} ${year} backgammon`);
    const liveUrl = "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(`${t.name} ${year} live`) + "&sp=EgJAAQ%253D%253D"; // live filter
    const todayUrl = "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(`${t.name} ${year}`) + "&sp=EgQIAxAB"; // uploaded today

    return `
      <div class="video-card ${isLive ? "live" : ""}">
        <div class="video-card-title">${escapeHtml(t.name)}</div>
        <div class="video-card-sub">${escapeHtml(t.city)}, ${escapeHtml(t.country)} • ${formatDateRange(t.startDate, t.endDate)}</div>
        <div class="video-actions">
          ${isLive
            ? `<a class="primary" href="${escapeAttr(todayUrl)}" target="_blank" rel="noopener">▶ Today's uploads</a>
               <a href="${escapeAttr(liveUrl)}" target="_blank" rel="noopener">🔴 Live streams</a>`
            : `<a class="primary" href="${escapeAttr(searchUrl)}" target="_blank" rel="noopener">▶ Watch on YouTube</a>`}
          <a href="${escapeAttr(t.website)}" target="_blank" rel="noopener">Official site</a>
        </div>
      </div>
    `;
  }

  /* ---------- Tab switching ---------- */
  function switchTab(tabName) {
    els.tabs.forEach(t => {
      const active = t.dataset.tab === tabName;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active);
    });
    els.tabPanels.forEach(p => {
      p.classList.toggle("active", p.id === "tab-" + tabName);
    });

    if (tabName === "videos") {
      renderVideos();
    } else if (tabName === "tournaments" && map) {
      // re-trigger map size calc since it was hidden
      setTimeout(() => map.invalidateSize(), 50);
    }
  }

  /* ---------- Wire events ---------- */
  function wireEvents() {
    [els.search, els.region, els.country, els.month, els.format,
     els.prizeTier, els.feeMax, els.upcomingOnly, els.sort]
      .forEach(el => el.addEventListener("input", render));

    els.resetBtn.addEventListener("click", () => {
      els.search.value = "";
      els.region.value = "";
      els.country.value = "";
      els.month.value = "";
      els.format.value = "";
      els.prizeTier.value = "";
      els.feeMax.value = "";
      els.upcomingOnly.checked = true;
      els.sort.value = userLocation ? "distance" : "date";
      render();
    });

    els.nearMeBtn.addEventListener("click", requestLocation);

    els.tabs.forEach(tab => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    els.closeDetail.addEventListener("click", closeDetail);
    els.overlay.addEventListener("click", (e) => {
      if (e.target === els.overlay) closeDetail();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDetail();
    });
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    populateFilterOptions();
    initMap();
    wireEvents();
    render();
  });
})();
