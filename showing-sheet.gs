// ============================================================
// Lance Anderson — Land Showing Sheet  v40
// ============================================================
// Showings tab — unified land + residential, auto-detected
// Data tab — multiple MLS paste blocks, each with own header
// Col K — land gets full links + boundary; residential MLS only
// GPS — SGID → geocode → county centroid fallback chain
// v40 — parcel-specific County Recorder links:
//       Utah Co → property.asp deep link, Sanpete → SGID explorer,
//       others → UGRC CoParcel_URL (self-updating) → static fallback
// ============================================================

// ── Brand ───────────────────────────────────────────────────
const TERRACOTTA  = '#C0652A';
const NAVY        = '#2F3E46';
const CREAM       = '#F4EDE4';
const ALT_ROW     = '#EAE8E0';
const RES_ALT     = '#E8EEF4';
const RES_BASE    = '#F0F4F8';
const WHITE       = '#FFFFFF';
const LINK_COLOR  = '#1155CC';
const LOGO_URL    = 'https://drive.google.com/uc?export=view&id=1NosHz-mLGpPckIeBhrQpgtwH5YU_Lu6s';
const MLS_BASE    = 'https://www.utahrealestate.com/';
const MAPS_KEY    = 'PASTE_YOUR_KEY_HERE';  // real key lives in Apps Script only
const BOUNDARY_TOOL = 'https://lancea141-source.github.io/utah-parcel-lookup/boundary.html';

// ── County SGID Services ────────────────────────────────────
const SGID_BASE = 'https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/';
const SERVICES = {
  'Salt Lake': SGID_BASE + 'Parcels_SaltLake/FeatureServer/0',
  'Utah':      SGID_BASE + 'Parcels_Utah/FeatureServer/0',
  'Juab':      SGID_BASE + 'Parcels_Juab/FeatureServer/0',
  'Sanpete':   SGID_BASE + 'Parcels_Sanpete/FeatureServer/0',
  'Davis':     SGID_BASE + 'Parcels_Davis/FeatureServer/0',
  'Tooele':    SGID_BASE + 'Parcels_Tooele/FeatureServer/0',
  'Summit':    SGID_BASE + 'Parcels_Summit/FeatureServer/0',
  'Wasatch':   SGID_BASE + 'Parcels_Wasatch/FeatureServer/0',
  'Duchesne':  SGID_BASE + 'Parcels_Duchesne/FeatureServer/0',
  'Cache':     SGID_BASE + 'Parcels_Cache/FeatureServer/0',
  'Weber':     SGID_BASE + 'Parcels_Weber/FeatureServer/0',
  'Morgan':    SGID_BASE + 'Parcels_Morgan/FeatureServer/0',
  'Carbon':    SGID_BASE + 'Parcels_Carbon/FeatureServer/0',
  'Box Elder': SGID_BASE + 'Parcels_BoxElder/FeatureServer/0',
};

// ── County centroids — last resort GPS fallback ─────────────
const COUNTY_CENTROIDS = {
  'Salt Lake': '40.6609,-111.9389',
  'Utah':      '40.0178,-111.6571',
  'Juab':      '39.7068,-112.7836',
  'Sanpete':   '39.3736,-111.5760',
  'Davis':     '40.9897,-111.8888',
  'Tooele':    '40.2241,-113.0024',
  'Summit':    '40.8674,-110.9946',
  'Wasatch':   '40.3300,-111.1721',
  'Duchesne':  '40.2977,-110.4263',
  'Cache':     '41.7371,-111.7376',
  'Weber':     '41.2697,-111.8966',
  'Morgan':    '41.0895,-111.5743',
  'Carbon':    '39.6724,-110.5957',
  'Box Elder': '41.5258,-113.0831',
};

// ── County Recorders (static fallbacks) ─────────────────────
const RECORDERS = {
  'Salt Lake': 'https://slco.org/recorder/',
  'Utah':      'https://maps.utahcounty.gov/ParcelMap/ParcelMap.html',
  'Juab':      'https://webapps.cloudsmartgis.com/ClientRelated/Utah/JuabCounty/JuabCounty/TaxParcelViewerLite/',
  'Sanpete':   'https://opendata.gis.utah.gov/datasets/777e751aa4164b83bf1d76f811f8e5b3_0/explore',
  'Davis':     'https://www.daviscountyutah.gov/recorder',
  'Tooele':    'https://www.tooeleco.gov/recorder',
  'Summit':    'https://www.summitcountyutah.gov/recorder',
  'Wasatch':   'https://www.wasatchcounty.gov/recorder',
  'Duchesne':  'https://www.duchesne.utah.gov/recorder',
  'Cache':     'https://www.cachecounty.gov/recorder',
  'Weber':     'https://www.webercountyutah.gov/recorder',
  'Morgan':    'https://www.morgancountyutah.gov/recorder',
  'Carbon':    'https://www.carbon.utah.gov/recorder',
  'Box Elder': 'https://www.boxeldercounty.org/recorder',
};

// ── SGID Open Data explorer dataset IDs (parcel deep links) ──
// Add more counties: opendata.gis.utah.gov → county parcels dataset
// → copy the hash from the /datasets/<ID>/explore URL
const SGID_EXPLORER = {
  'Sanpete': '777e751aa4164b83bf1d76f811f8e5b3_0',
};

// ── Statewide SGID layer — UGRC county link per parcel ───────
const STATEWIDE_PARCELS = SGID_BASE + 'UtahStatewideParcels/FeatureServer/0';

function coParcelUrl(taxId) {
  const id = (taxId || '').split('&')[0].trim();
  if (!id) return '';
  const variants = [...new Set([id, id.replace(/-/g, ''), id.replace(/[:\s]/g, '')])];
  const where = variants.map(v => "PARCEL_ID='" + v + "'").join(' OR ');
  try {
    const url  = STATEWIDE_PARCELS + '/query?where=' + encodeURIComponent(where) +
                 '&outFields=CoParcel_URL&returnGeometry=false&f=json';
    const json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    if (json.features && json.features.length && json.features[0].attributes.CoParcel_URL) {
      return json.features[0].attributes.CoParcel_URL;
    }
  } catch (e) {}
  return '';
}

// ── Build a parcel-specific recorder/viewer URL ──────────────
// Cascade: county deep link → SGID explorer deep link →
//          UGRC CoParcel_URL (self-updating) → static fallback
function recorderUrl(county, taxId, lat, lng) {
  const id = (taxId || '').split('&')[0].trim();

  // Utah County — Land Records property dashboard, serial = digits only
  if (county === 'Utah' && id) {
    const serial = id.replace(/\D/g, '');
    if (serial.length >= 7) {
      return 'https://www.utahcounty.gov/landrecords/property.asp?av_serial=' + serial;
    }
  }

  // SGID Open Data explorer — filter is base64({"PARCEL_ID":[...]})
  if (SGID_EXPLORER[county] && id) {
    const variants = [...new Set([id, id.replace(/-/g, ''), id.replace(/^0+/, '')])];
    const filter = encodeURIComponent(
      Utilities.base64Encode(JSON.stringify({ PARCEL_ID: variants }))
    );
    let url = 'https://opendata.gis.utah.gov/datasets/' + SGID_EXPLORER[county] +
              '/explore?filters=' + filter;
    if (lat && lng) url += '&location=' + lat + '%2C' + lng + '%2C15';
    return url;
  }

  // UGRC-maintained county website — auto-updates when counties migrate
  return coParcelUrl(taxId) || RECORDERS[county] || '';
}

// ============================================================
// CUSTOM MENU
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🌄 Showing Sheet')
    .addItem('▶ Sync & Build (Full Run)', 'syncAndBuild')
    .addSeparator()
    .addItem('↺ Sync Data Only', 'syncAllData')
    .addItem('📸 Reload Images', 'fetchAllImages')
    .addItem('🚗 Rebuild Directions Link', 'buildDirectionsLink')
    .addSeparator()
    .addItem('⚙️ Setup Sheet (first time only)', 'setupSheet')
    .addItem('🐛 Diagnose SGID Field Names', 'diagnoseSGID')
    .addItem('🔬 Diagnose Parcel API', 'diagnoseParcelAPI')
    .addItem('🔍 Debug Land Detection', 'debugLandDetection')
    .addToUi();
}

// ============================================================
// SETUP
// ============================================================
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let dataSheet = ss.getSheetByName('MLS Data');
  if (!dataSheet) dataSheet = ss.insertSheet('MLS Data');
  setupDataTab(dataSheet);

  let showSheet = ss.getSheetByName('Showings');
  if (!showSheet) {
    showSheet = ss.insertSheet('Showings');
  } else {
    showSheet.clear();
    showSheet.clearFormats();
  }
  buildSheetStructure(showSheet);

  SpreadsheetApp.getUi().alert(
    '✅ Sheet is ready!\n\n' +
    'HOW TO USE THE MLS DATA TAB:\n' +
    '• Paste any MLS report (with its header row) starting at row 1\n' +
    '• Paste another report below it — header row + data\n' +
    '• Mix land and residential — the script auto-detects each\n' +
    '• Column order does not matter — headers matched by name\n\n' +
    'Then run: 🌄 Showing Sheet > ▶ Sync & Build'
  );
}

function setupDataTab(sheet) {
  sheet.clear();
  sheet.getRange(1, 1, 1, 10).merge()
    .setValue('📋 MLS DATA — Paste your MLS reports here (row 1+). Each report should include its own header row. Mix land and residential freely.')
    .setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
}

// ============================================================
// SHEET STRUCTURE
// ============================================================
function buildSheetStructure(showSheet) {

  // ── Column widths ──────────────────────────────────────────
  var colWidths = [120,80,200,120,75,90,170,160,160,130,100,110];
  for (var c = 0; c < colWidths.length; c++) {
    showSheet.setColumnWidth(c + 1, colWidths[c]);
  }

  // ── Row 1: navy header bar ─────────────────────────────────
  showSheet.setRowHeight(1, 90);
  showSheet.getRange(1, 1, 1, 12).setBackground(NAVY).setFontColor(WHITE);

  // A1 — Logo
  showSheet.getRange(1, 1)
    .setFormula('=IMAGE("' + LOGO_URL + '",4,80,110)')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // B1 — empty navy (already set above)

  // C1 — Directions placeholder
  showSheet.getRange(1, 3)
    .setValue('Run Sync & Build to generate directions link')
    .setFontColor(TERRACOTTA)
    .setFontWeight('bold')
    .setFontSize(12)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  // D1–H1 — empty navy (already set above)

  // I1-J1 — merged customer info placeholder
  showSheet.getRange(1, 9, 1, 2).merge()
    .setValue('Customer Name' + '\n' + 'Customer Email' + '\n' + 'Customer Phone #')
    .setBackground(NAVY)
    .setFontColor(WHITE)
    .setFontSize(11)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setWrap(true);

  // K1–L1 — navy, no text
  showSheet.getRange(1, 11, 1, 2)
    .setValue('')
    .setBackground(NAVY);

  // ── Row 2: terracotta header bar ───────────────────────────
  showSheet.setRowHeight(2, 32);
  showSheet.getRange(2, 1, 1, 12)
    .setBackground(TERRACOTTA)
    .setFontColor(CREAM)
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setValues([['Photo','Time','Address','Price','MLS#','Status','Details','Notes','Location','Lookup','Agent','Phone']]);

  // J2 — Toggle checkbox only, no label
  showSheet.getRange(2, 10)
    .clearContent()
    .insertCheckboxes()
    .setValue(true)
    .setBackground(TERRACOTTA)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setNote('Checked = Agent & Phone visible\nUnchecked = hidden from customers');

  // K2–L2 — terracotta to match row
  showSheet.getRange(2, 11, 1, 2)
    .setBackground(TERRACOTTA)
    .setFontColor(CREAM);

  showSheet.setFrozenRows(2);

  // Hide K & L by default
  showSheet.hideColumns(11);
  showSheet.hideColumns(12);
}

// ============================================================
// HEADER RESOLVER — flexible column alias matching
// ============================================================
function makeIdx(headers) {
  const col = (primary, ...aliases) => {
    const found = [primary, ...aliases].map(n => headers.indexOf(n)).find(i => i !== -1);
    return found !== undefined ? found : -1;
  };
  return {
    status:    col('Status'),
    price:     col('List Price'),
    origPrice: col('Original List Price'),
    mls:       col('MLS#', 'MLS Number', 'MLS'),
    dom:       col('DOM', 'Days on Market'),
    taxId:     col('Tax ID', 'Tax Id', 'Parcel', 'Parcel #', 'APN'),
    hoa:       col('HOA?', 'HOA'),
    hoaFee:    col('HOA Fee', 'HOA Amount'),
    address:   col('Address', 'Street Address'),
    city:      col('City'),
    county:    col('County'),
    acres:     col('Acres', 'Acreage', 'Lot Acres'),
    sqft:      col('Total Square Feet', 'Square Feet', 'Sq Ft', 'SqFt'),
    beds:      col('Total Bedrooms', 'Bedrooms', 'Beds'),
    baths:     col('Total Bathrooms', 'Bathrooms', 'Baths'),
    zoning:    col('Zoning'),
    area:      col('Area'),
    propType:  col('Property Type', 'Type'),
    agent:     col('Agent', 'Agent Name', 'Listing Agent'),
    contact:   col('Contact', 'Contact Name'),
    phone1:    col('Contact Phone One', 'Phone', 'Agent Phone', 'Phone 1', 'Contact Phone'),
    phone2:    col('Contact Phone Two', 'Phone 2'),
    water:     col('Water', 'Water Source'),
    irrigation:col('Irrigation'),
    utilities: col('Utilities'),
    waterShare:col('Water Acre Ft/Share One', 'Water Shares'),
    priceUnit: col('Price Per Unit', 'Price Unit'),
    gpsCoords: col('GPS Coords (auto)', 'GPS', 'GPS Coords'),
  };
}

// ============================================================
// LAND VS RESIDENTIAL DETECTION
// ============================================================
function isLandRow(row, idx) {
  const safe = (j) => (j !== -1 && j < row.length && row[j] != null) ? row[j].toString().trim() : '';
  const acres    = parseFloat(safe(idx.acres)) || 0;
  const sqft     = parseFloat(safe(idx.sqft).replace(/,/g,'')) || 0;
  const zoning   = safe(idx.zoning).toLowerCase();
  const propType = safe(idx.propType).toLowerCase();
  const taxId    = safe(idx.taxId);
  const water    = safe(idx.water);
  const utilities= safe(idx.utilities);

  // Explicit land indicators
  if (propType.match(/land|lot|acreage|farm|ranch/)) return true;
  if (zoning.match(/agricult|rural|range|farm|forest|open space/)) return true;
  if (acres >= 5) return true;

  // Land export signature: has Tax ID + water/utilities fields + no sqft column
  if (taxId && idx.sqft === -1) return true;

  // Land export signature: has Tax ID + water/utilities fields + sqft cell is empty
  if (taxId && water && sqft === 0) return true;

  // Large acreage even with residential zoning (rural Utah land listings)
  if (acres >= 1 && sqft === 0 && taxId) return true;

  return false;
}

// ============================================================
// PARSE DATA TAB — finds all header+data blocks
// ============================================================
function parseDataBlocks(dataSheet) {
  const lastRow = dataSheet.getLastRow();
  const lastCol = dataSheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const allValues = dataSheet.getRange(1, 1, lastRow, lastCol).getValues();
  const blocks = [];
  let currentHeaders = null;
  let currentIdx     = null;
  let currentRows    = [];
  let currentStart   = 0;

  for (let r = 0; r < allValues.length; r++) {
    const row = allValues[r];
    const rowStr = row.map(c => c.toString().trim());

    // Detect header row — must contain MLS# or MLS Number
    const mlsCol = rowStr.findIndex(c => c === 'MLS#' || c === 'MLS Number' || c === 'MLS');
    if (mlsCol !== -1) {
      // Save previous block regardless of row count
      if (currentHeaders) {
        blocks.push({ headers: currentHeaders, idx: currentIdx, rows: currentRows, startRow: currentStart });
        Logger.log('Block saved: ' + currentRows.length + ' rows, first header: ' + currentHeaders.slice(0,3).join(','));
      }
      currentHeaders = rowStr;
      currentIdx     = makeIdx(rowStr);
      currentRows    = [];
      currentStart   = r + 1;
      Logger.log('New header block at data-row ' + r + ': MLS# at col ' + mlsCol);
      continue;
    }

    // Skip completely empty rows
    if (rowStr.every(c => c === '')) continue;

    // Add to current block
    if (currentHeaders) {
      currentRows.push({ data: row, sheetRow: r + 2 });
    }
  }

  // Save last block
  if (currentHeaders && currentRows.length > 0) {
    blocks.push({ headers: currentHeaders, idx: currentIdx, rows: currentRows, startRow: currentStart });
  }

  return blocks;
}

// ============================================================
// MAIN SYNC & BUILD
// ============================================================
function syncAndBuild() {
  syncAllData();
  fetchAllImages();
  buildDirectionsLink();
  SpreadsheetApp.getUi().alert('✅ Done! Data synced, images loaded, directions built.');
}

// ============================================================
// SYNC ALL DATA
// ============================================================
function syncAllData() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName('MLS Data');
  const showSheet = ss.getSheetByName('Showings');
  if (!dataSheet || !showSheet) {
    SpreadsheetApp.getUi().alert('Run Setup first.');
    return;
  }

  // Clear showings data rows
  const lastRow = showSheet.getLastRow();
  if (lastRow >= 3) {
    showSheet.getRange(3, 1, lastRow - 2, 12).clearContent().clearFormat();
  }

  const blocks = parseDataBlocks(dataSheet);
  if (blocks.length === 0) {
    SpreadsheetApp.getUi().alert('No data found. Paste your MLS reports into the MLS Data tab.');
    return;
  }

  let sheetRow = 3;

  for (const block of blocks) {
    const { headers, idx, rows } = block;

    // Check if GPS column exists, add if missing
    if (idx.gpsCoords === -1) {
      const newCol = headers.length + 1;
      // Find the actual header row in the sheet for this block
      // We'll just log — writing back is complex with multi-block
      Logger.log('No GPS Coords column in block with headers: ' + headers.slice(0,5).join(', '));
    }

    for (const { data: row, sheetRow: dataSheetRow } of rows) {
      const safe    = (j) => (j !== -1 && j < row.length && row[j] != null) ? row[j].toString().trim() : '';
      const safeNum = (j) => (j !== -1 && j < row.length && row[j] != null) ? Number(row[j]) : 0;

      const mls = safe(idx.mls);
      if (!mls || mls === 'MLS#') continue;

      try {
        const isLand    = isLandRow(row, idx);
        const status    = safe(idx.status);
        const price     = safeNum(idx.price);
        const origPrice = safeNum(idx.origPrice);
        const dom       = safe(idx.dom);
        const taxId     = safe(idx.taxId);
        const hoa       = safe(idx.hoa);
        const hoaFee    = safe(idx.hoaFee);
        const address   = safe(idx.address);
        const city      = safe(idx.city);
        const county    = safe(idx.county);
        const acres     = safe(idx.acres);
        const sqft      = safe(idx.sqft);
        const beds      = safe(idx.beds);
        const baths     = safe(idx.baths);
        const zoning    = safe(idx.zoning);
        const agent     = safe(idx.agent) || safe(idx.contact);
        const phone1    = safe(idx.phone1);
        const phone2    = safe(idx.phone2);
        const water     = safe(idx.water);
        const irrigation= safe(idx.irrigation);
        const utilities = safe(idx.utilities);
        const waterShare= safeNum(idx.waterShare);
        let   gpsCoords = safe(idx.gpsCoords);

        if (gpsCoords) Logger.log('Manual GPS for MLS ' + mls + ': ' + gpsCoords);

        // ── GPS resolution chain ──
        if (!gpsCoords && taxId && county && isLand) {
          const primaryId = taxId.split('&')[0].trim();
          const sgid = fetchParcelFromSGID(primaryId, county);
          if (sgid && sgid.coords) {
            gpsCoords = sgid.coords;
            Logger.log('SGID GPS for ' + primaryId + ': ' + gpsCoords);
            // Write back to data sheet
            if (idx.gpsCoords !== -1) {
              dataSheet.getRange(dataSheetRow, idx.gpsCoords + 1).setValue(gpsCoords);
            }
          } else {
            Logger.log('SGID miss: ' + primaryId + ' | ' + county);
          }
        }

        // Geocode fallback — no address AND no GPS
        if (!gpsCoords && !address && (city || county)) {
          const geocoded = geocodeLocation(city, county);
          if (geocoded) {
            gpsCoords = geocoded;
            Logger.log('Geocoded: ' + city + ', ' + county + ' → ' + gpsCoords);
          } else if (county && COUNTY_CENTROIDS[county]) {
            gpsCoords = COUNTY_CENTROIDS[county];
            Logger.log('County centroid fallback: ' + county + ' → ' + gpsCoords);
          }
        }

        // ── Price display ──
        const priceUnit  = safe(idx.priceUnit).toLowerCase();
        const acresNum   = parseFloat(acres) || 0;
        const isPricePerAcre = isLand && priceUnit === 'acre' && acresNum > 0;
        const totalPrice = isPricePerAcre ? Math.round(price * acresNum) : price;
        const displayPPAcre = isPricePerAcre ? price : (isLand && price > 0 && acresNum > 0 ? Math.round(price / acresNum) : 0);

        const priceFormatted = totalPrice > 0 ? '$' + totalPrice.toLocaleString() : 'TBD';
        const pricePerAcreStr = displayPPAcre > 0 ? '\n$' + displayPPAcre.toLocaleString() + '/acre' : '';
        const priceDrop      = (origPrice > 0 && totalPrice < origPrice * (isPricePerAcre ? acresNum : 1))
          ? '\n▼ ' + (((origPrice - price) / origPrice) * 100).toFixed(1) + '%' : '';
        const priceDisplay   = priceFormatted + pricePerAcreStr + priceDrop;

        // ── HOA ──
        let hoaDisplay = '';
        if (hoa.toLowerCase() === 'yes') hoaDisplay = hoaFee ? 'HOA: $' + hoaFee + '/yr' : 'HOA: Yes';
        else if (hoa.toLowerCase() === 'no') hoaDisplay = 'HOA: No';

        // ── Phone ──
        const phone        = phone1 || phone2;
        const phoneRaw     = phone.replace(/\D/g, '');
        const phoneDisplay = phoneRaw.length === 10
          ? '(' + phoneRaw.slice(0,3) + ') ' + phoneRaw.slice(3,6) + '-' + phoneRaw.slice(6) : phone;

        // ── Map URL — GPS pin preferred ──
        const gpsClean   = gpsCoords ? gpsCoords.replace(/\s/g,'') : '';
        const fullAddress = [address, city, 'UT'].filter(Boolean).join(', ');
        const mapUrl     = gpsClean
          ? 'https://www.google.com/maps/search/?api=1&query=' + gpsClean
          : 'https://maps.google.com/?q=' + encodeURIComponent(fullAddress);

        // ── Details cell ──
        let detailLines = [];
        if (isLand) {
          if (acres)      detailLines.push('ACRES: ' + acres);
          if (county)     detailLines.push('COUNTY: ' + county);
          if (taxId)      detailLines.push('PARCEL: ' + taxId);
          if (zoning)     detailLines.push('ZONING: ' + zoning);
          if (hoaDisplay) detailLines.push(hoaDisplay);
          if (water)      detailLines.push('WATER: ' + water);
          if (utilities)  detailLines.push('UTILITIES: ' + utilities);
          if (irrigation && irrigation.toLowerCase() !== 'not available')
            detailLines.push('IRRIGATION: ' + irrigation);
          if (waterShare > 0) detailLines.push('WATER SHARES: ' + waterShare);
          if (gpsCoords)  detailLines.push('GPS: ' + gpsCoords);
        } else {
          if (beds)  detailLines.push('BEDS: ' + beds);
          if (baths) detailLines.push('BATHS: ' + baths);
          if (sqft)  detailLines.push('SQFT: ' + Number(sqft.replace(/,/g,'')).toLocaleString());
          if (acres && parseFloat(acres) > 0) detailLines.push('LOT: ' + acres + ' ac');
          if (hoaDisplay) detailLines.push(hoaDisplay);
        }

        const bg = isLand
          ? (sheetRow % 2 === 0 ? ALT_ROW  : CREAM)
          : (sheetRow % 2 === 0 ? RES_ALT  : RES_BASE);

        // ── A: Photo ──
        const photoCell = showSheet.getRange(sheetRow, 1);
        const mlsImgUrl = getMlsImage(mls);
        if (mlsImgUrl) {
          photoCell.setFormula('=IMAGE("' + mlsImgUrl + '",4,100,110)');
        } else if (gpsClean && gpsClean.includes(',')) {
          const parts  = gpsClean.split(',');
          const satUrl = 'https://maps.googleapis.com/maps/api/staticmap?center=' + parts[0] + ',' + parts[1] +
            '&zoom=15&size=400x200&maptype=satellite&markers=color:red%7C' + parts[0] + ',' + parts[1] +
            '&key=' + MAPS_KEY;
          photoCell.setFormula('=IMAGE("' + satUrl + '",4,100,110)');
        } else {
          photoCell.setValue('No image').setFontColor('#aaaaaa').setFontStyle('italic');
        }
        photoCell.setBackground(bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
        showSheet.setRowHeight(sheetRow, 110);

        // ── B: Time ──
        showSheet.getRange(sheetRow, 2).setValue('')
          .setBackground(bg).setHorizontalAlignment('center').setVerticalAlignment('middle')
          .setFontColor(TERRACOTTA).setFontWeight('bold').setFontSize(12)
          .setWrap(true);

        // ── C: Address ──
        const addrLine1   = address || (isLand && acres ? acres + ' acres' : '') || city || 'Unknown';
        const addrLine2   = city ? city + ', UT' : 'UT';
        const pinLabel    = gpsClean ? ' 📍' : '';
        const addrDisplay = addrLine1 + '\n' + addrLine2 + pinLabel;
        showSheet.getRange(sheetRow, 3)
          .setFormula('=HYPERLINK("' + mapUrl + '","' + addrDisplay.replace(/"/g,"'") + '")')
          .setBackground(bg).setFontSize(11).setVerticalAlignment('middle')
          .setFontColor(LINK_COLOR).setWrap(true);

        // ── D: Price ──
        showSheet.getRange(sheetRow, 4).setValue(priceDisplay)
          .setBackground(bg).setFontWeight('bold').setFontSize(11)
          .setFontColor(NAVY).setVerticalAlignment('middle').setWrap(true);

        // ── E: MLS# ──
        showSheet.getRange(sheetRow, 5)
          .setFormula('=HYPERLINK("' + MLS_BASE + mls + '","' + mls + '")')
          .setBackground(bg).setFontSize(11)
          .setHorizontalAlignment('center').setVerticalAlignment('middle')
          .setFontColor(LINK_COLOR);

        // ── F: Status + DOM ──
        const statusCell = showSheet.getRange(sheetRow, 6);
        statusCell.setValue(status + (dom ? '\nDOM: ' + dom : ''))
          .setBackground(bg).setHorizontalAlignment('left').setVerticalAlignment('middle')
          .setFontSize(10).setWrap(true);
        const sl = status.toLowerCase();
        if (sl.includes('active'))         statusCell.setFontColor('#16a34a');
        else if (sl.includes('backup'))    statusCell.setFontColor('#d97706');
        else if (sl.includes('contract'))  statusCell.setFontColor('#d97706');
        else if (sl.includes('sold'))      statusCell.setFontColor('#dc2626');
        else                               statusCell.setFontColor(NAVY);

        // ── G: Details ──
        showSheet.getRange(sheetRow, 7).setValue(detailLines.join('\n'))
          .setBackground(bg).setHorizontalAlignment('left').setVerticalAlignment('top')
          .setFontSize(9).setFontColor(NAVY).setVerticalAlignment('middle').setWrap(true);

        // ── H: Notes ──
        showSheet.getRange(sheetRow, 8).setValue('')
          .setBackground(bg).setVerticalAlignment('top').setHorizontalAlignment('left')
          .setFontColor(TERRACOTTA).setFontSize(10).setWrap(true);

        // ── K: Agent (hidden) ──
        showSheet.getRange(sheetRow, 11).setValue(agent)
          .setBackground(bg).setVerticalAlignment('middle').setHorizontalAlignment('left')
          .setFontColor(TERRACOTTA).setFontWeight('bold').setFontSize(10).setWrap(true);

        // ── L: Phone (hidden) ──
        showSheet.getRange(sheetRow, 12).setValue(phone ? '📞 ' + phoneDisplay : '')
          .setBackground(bg).setVerticalAlignment('middle').setHorizontalAlignment('left')
          .setFontColor(TERRACOTTA).setFontWeight('bold').setFontSize(10).setWrap(true);

        // ── K: Links ──
        if (isLand) {
          buildLandLinksCell(showSheet, sheetRow, 9, bg, gpsCoords, taxId, county, mls);
        } else {
          buildResLinksCell(showSheet, sheetRow, 9, bg, mls, gpsCoords);
        }

        showSheet.getRange(sheetRow, 1, 1, 12)
          .setBorder(false, false, true, false, false, false, '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);

        sheetRow++;
      } catch(err) {
        Logger.log('Error MLS ' + mls + ': ' + err.message);
        SpreadsheetApp.getActiveSpreadsheet().toast('Error on MLS ' + mls + ': ' + err.message, '⚠️', 6);
      }
    }
  }

  applyColumnFormats(showSheet, sheetRow - 1);
}


// ── Convert lat/lng to Web Mercator for parcels.utah.gov deep link ──
function toWebMercator(lat, lng) {
  var x = lng * 20037508.34 / 180;
  var y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  y = y * 20037508.34 / 180;
  return { x: x, y: y };
}

// ============================================================
// BUILD LINKS — LAND
// Col K = Location (Maps + Boundary)
// Col L = Lookup (State Parcel + Recorder)
// ============================================================
function buildLandLinksCell(sheet, row, col, bg, gpsCoords, taxId, county, mls) {
  const gpsClean     = gpsCoords ? gpsCoords.replace(/\s/g,'') : '';
  const primaryTaxId = taxId ? taxId.split('&')[0].trim() : '';
  const lat          = gpsClean ? gpsClean.split(',')[0] : '';
  const lng          = gpsClean ? gpsClean.split(',')[1] : '';

  // Col K — Location
  const locLinks = [];
  if (gpsClean) {
    locLinks.push({ label: '🗺 Google Maps',     url: 'https://www.google.com/maps/search/?api=1&query=' + gpsClean });
    locLinks.push({ label: '🍎 Apple Maps',      url: 'https://maps.apple.com/?ll=' + gpsClean + '&q=Parcel' });
  }
  if (gpsClean && primaryTaxId && county) {
    locLinks.push({ label: '📐 Parcel Boundary', url: BOUNDARY_TOOL + '?parcel=' + encodeURIComponent(primaryTaxId) + '&county=' + encodeURIComponent(county) + '&lat=' + lat + '&lng=' + lng });
  }
  writeLinksCell(sheet, row, col, bg, locLinks);

  // Col L — Lookup
  const lookLinks = [];
  if (lat && lng) {
    var satUrl = 'https://www.google.com/maps/@' + lat + ',' + lng + ',18z/data=!3m1!1e3';
    lookLinks.push({ label: '🛰 Satellite View', url: satUrl });
  }
  const recUrl = recorderUrl(county, taxId, lat, lng);
  if (recUrl) lookLinks.push({ label: '📋 County Recorder', url: recUrl });

  // Wells map — fetch wells server-side, embed in URL
  if (lat && lng && primaryTaxId) {
    var wells    = fetchUSGSWells(parseFloat(lat), parseFloat(lng));
    var wellsUrl = 'https://lancea141-source.github.io/utah-parcel-lookup/wells.html' +
      '?parcel=' + encodeURIComponent(primaryTaxId) +
      '&county=' + encodeURIComponent(county) +
      '&lat=' + lat + '&lng=' + lng;
    if (wells.length > 0) {
      wellsUrl += '&wells=' + encodeURIComponent(wells.join('|'));
    }
    lookLinks.push({ label: '💧 Nearby Wells (' + wells.length + ')', url: wellsUrl });
  }
  writeLinksCell(sheet, row, col + 1, bg, lookLinks);
}

// ============================================================
// BUILD LINKS — RESIDENTIAL
// Col K = Location (Maps only)
// Col L = empty
// ============================================================
function buildResLinksCell(sheet, row, col, bg, mls, gpsCoords) {
  const gpsClean = gpsCoords ? gpsCoords.replace(/\s/g,'') : '';
  const locLinks = [];
  if (gpsClean) {
    locLinks.push({ label: '🗺 Google Maps', url: 'https://www.google.com/maps/search/?api=1&query=' + gpsClean });
    locLinks.push({ label: '🍎 Apple Maps',  url: 'https://maps.apple.com/?ll=' + gpsClean + '&q=Parcel' });
  }
  writeLinksCell(sheet, row, col, bg, locLinks);
  // Col J (col+1) — empty for residential
  sheet.getRange(row, col + 1).setValue('').setBackground(bg);
}

// ── Write rich text links to a cell ─────────────────────────
function writeLinksCell(sheet, row, col, bg, linkDefs) {
  if (linkDefs.length === 0) {
    sheet.getRange(row, col).setValue('—').setBackground(bg);
    return;
  }
  const text = linkDefs.map(l => l.label).join('\n');
  const rtv  = SpreadsheetApp.newRichTextValue().setText(text);
  let pos = 0;
  linkDefs.forEach((l, i) => {
    try { rtv.setLinkUrl(pos, pos + l.label.length, l.url); } catch(e) {}
    pos += l.label.length + (i < linkDefs.length - 1 ? 1 : 0);
  });
  try {
    sheet.getRange(row, col).setRichTextValue(rtv.build());
  } catch(e) {
    sheet.getRange(row, col).setValue(text);
  }
  sheet.getRange(row, col)
    .setBackground(bg).setVerticalAlignment('top').setHorizontalAlignment('left')
    .setFontColor(LINK_COLOR).setFontSize(9).setWrap(true);
}

// ============================================================
// DIRECTIONS LINK
// ============================================================
function buildDirectionsLink() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const showSheet = ss.getSheetByName('Showings');
  if (!showSheet) return;
  const lastRow = showSheet.getLastRow();

  const stops = [];
  for (let row = 3; row <= lastRow; row++) {
    const details  = showSheet.getRange(row, 7).getValue().toString();
    const gpsMatch = details.match(/GPS:\s*([-\d.]+,\s*[-\d.]+)/);
    if (gpsMatch) {
      stops.push(gpsMatch[1].trim());
    } else {
      const formula  = showSheet.getRange(row, 3).getFormula();
      const urlMatch = formula.match(/query=([^"&]+)/);
      if (urlMatch) stops.push(decodeURIComponent(urlMatch[1].trim()));
    }
  }

  if (stops.length === 0) return;

  const dest      = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  let url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest);
  if (waypoints.length > 0) {
    url += '&waypoints=' + waypoints.map(a => encodeURIComponent(a)).join('%7C');
  }

  try { showSheet.getRange(1, 3, 1, 2).breakApart(); } catch(e) {}
  showSheet.getRange(1, 3)
    .setFormula('=HYPERLINK("' + url + '","🚗 Get Directions")')
    .setBackground(NAVY).setFontColor(TERRACOTTA).setFontWeight('bold').setFontSize(12)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  showSheet.getRange(1, 4).clearContent().setBackground(NAVY);
}

// ============================================================
// FETCH ALL IMAGES
// ============================================================
function fetchAllImages() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const showSheet = ss.getSheetByName('Showings');
  if (!showSheet) return;
  const lastRow = showSheet.getLastRow();

  for (let row = 3; row <= lastRow; row++) {
    const mlsFormula = showSheet.getRange(row, 5).getFormula();
    const mlsMatch   = mlsFormula.match(/"(\d{6,7})"/);
    if (!mlsMatch) continue;
    const mls       = mlsMatch[1];
    const imgUrl    = getMlsImage(mls);
    const photoCell = showSheet.getRange(row, 1);

    if (imgUrl) {
      photoCell.setFormula('=IMAGE("' + imgUrl + '",4,100,110)');
    } else {
      const details  = showSheet.getRange(row, 7).getValue().toString();
      const gpsMatch = details.match(/GPS:\s*([-\d.]+,\s*[-\d.]+)/);
      if (gpsMatch) {
        const parts  = gpsMatch[1].split(',');
        const lat    = parts[0].trim();
        const lng    = parts[1].trim();
        const satUrl = 'https://maps.googleapis.com/maps/api/staticmap?center=' + lat + ',' + lng +
          '&zoom=15&size=400x200&maptype=satellite&markers=color:red%7C' + lat + ',' + lng +
          '&key=' + MAPS_KEY;
        photoCell.setFormula('=IMAGE("' + satUrl + '",4,100,110)');
      }
    }
  }
}

// ============================================================
// SGID PARCEL LOOKUP
// ============================================================
function fetchParcelFromSGID(parcelId, county) {
  if (!parcelId || !county || !SERVICES[county]) return null;
  const serviceUrl = SERVICES[county];
  const stripped   = parcelId.replace(/^0+/, '') || '0';
  const variants   = [
    parcelId,
    parcelId.toUpperCase(),
    stripped,
    parcelId + '-',
    parcelId.replace(/-/g,''),
    parcelId + '-0000',
    parcelId + '-00000',
    parcelId.replace(/-/g,'').replace(/^0+/,''),
  ];
  const fields     = ['PARCEL_ID','ParcelID','SERIAL','PARCELID','APN','TAX_ID','TAXID','SERIAL_NUM'];

  // Phase 1: exact match
  for (const variant of variants) {
    for (const field of fields) {
      try {
        const where = field + "='" + variant + "'";
        const url   = serviceUrl + '/query?where=' + encodeURIComponent(where) + '&outFields=*&outSR=4326&f=geojson';
        const res   = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const json  = JSON.parse(res.getContentText());
        if (json.features && json.features.length > 0) {
          return extractCoordsFromFeature(json.features[0]);
        }
      } catch(e) {}
    }
  }

  // Phase 2: wildcard fallback — try prefix match (faster) then contains
  const core = parcelId.replace(/^0+/,'');
  for (const field of fields) {
    try {
      const where = field + " LIKE '" + core + "%'";
      const url   = serviceUrl + '/query?where=' + encodeURIComponent(where) + '&outFields=*&outSR=4326&f=geojson';
      const res   = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const json  = JSON.parse(res.getContentText());
      if (json.features && json.features.length > 0) {
        Logger.log('Wildcard hit: ' + field + " LIKE '%" + core + "%'");
        return extractCoordsFromFeature(json.features[0]);
      }
    } catch(e) {}
  }

  return null;
}

function extractCoordsFromFeature(feature) {
  const props = feature.properties || {};
  const geo   = feature.geometry;
  let coords  = '';
  if (geo && geo.coordinates) {
    const ring = geo.type === 'Polygon' ? geo.coordinates[0] : geo.coordinates[0][0];
    const lats = ring.map(p => p[1]);
    const lngs = ring.map(p => p[0]);
    const lat  = ((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(5);
    const lng  = ((Math.min(...lngs) + Math.max(...lngs)) / 2).toFixed(5);
    coords = lat + ', ' + lng;
  }
  return { coords, acres: props.ACRE || props.GIS_ACRES || '', owner: props.OWNER || props.OWN_NAME || '' };
}

function fetchParcelGeoJSON(parcelId, county) {
  if (!parcelId || !county || !SERVICES[county]) return null;
  const serviceUrl = SERVICES[county];
  const stripped   = parcelId.replace(/^0+/, '') || '0';
  const variants   = [
    parcelId,
    parcelId.toUpperCase(),
    stripped,
    parcelId + '-',
    parcelId.replace(/-/g,''),
    parcelId + '-0000',
    parcelId + '-00000',
    parcelId.replace(/-/g,'').replace(/^0+/,''),
  ];
  const fields     = ['PARCEL_ID','ParcelID','SERIAL','PARCELID','APN','TAX_ID','TAXID','SERIAL_NUM'];

  for (const variant of variants) {
    for (const field of fields) {
      try {
        const where = field + "='" + variant + "'";
        const url   = serviceUrl + '/query?where=' + encodeURIComponent(where) + '&outFields=*&outSR=4326&f=geojson';
        const res   = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const json  = JSON.parse(res.getContentText());
        if (json.features && json.features.length > 0) return json;
      } catch(e) {}
    }
  }
  return null;
}

// ============================================================
// GEOCODE FALLBACK
// ============================================================
function geocodeLocation(city, county) {
  try {
    const query = [city, county + ' County', 'UT'].filter(Boolean).join(', ');
    const url   = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
                  encodeURIComponent(query) + '&key=' + MAPS_KEY;
    const res   = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json  = JSON.parse(res.getContentText());
    if (json.status === 'OK' && json.results.length > 0) {
      const loc = json.results[0].geometry.location;
      return loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5);
    }
    Logger.log('Geocode failed: ' + query + ' | ' + json.status);
  } catch(e) { Logger.log('Geocode error: ' + e.message); }
  return null;
}



// ============================================================
// FETCH USGS WELLS — called server-side during sync
// ============================================================
function fetchUSGSWells(lat, lng) {
  var R    = 0.029; // ~2 miles
  // Round to 5 decimal places to avoid floating point issues
  var west  = Math.round((lng - R) * 100000) / 100000;
  var south = Math.round((lat - R) * 100000) / 100000;
  var east  = Math.round((lng + R) * 100000) / 100000;
  var north = Math.round((lat + R) * 100000) / 100000;
  var bbox  = west + ',' + south + ',' + east + ',' + north;
  var url   = 'https://waterservices.usgs.gov/nwis/site/?format=rdb&siteType=GW&bbox=' + bbox +
              '&siteStatus=all&hasDataTypeCd=gw';
  Logger.log('USGS URL: ' + url);
  try {
    var res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code = res.getResponseCode();
    var text = res.getContentText();
    Logger.log('USGS response code: ' + code + ', length: ' + text.length);
    Logger.log('USGS first 200 chars: ' + text.substring(0, 200));

    var allLines = text.split('\n');
    var headers  = null;
    var wells    = [];

    for (var i = 0; i < allLines.length; i++) {
      var line = allLines[i].trim();
      if (!line || line.charAt(0) === '#') continue;
      if (line.indexOf('agency_cd') === 0) { headers = line.split('\t'); continue; }
      if (!headers) continue;
      // Skip format descriptor rows (e.g. "5s  15s  50s...")
      if (/^\d/.test(line) && line.indexOf('s') !== -1 && line.indexOf('USGS') === -1) continue;
      var cols = line.split('\t');
      if (cols.length < 5) continue;
      // Use index directly — avoid closure issue with var
      var latIdx   = headers.indexOf('dec_lat_va');
      var lngIdx   = headers.indexOf('dec_long_va');
      var idIdx    = headers.indexOf('site_no');
      var depthIdx = headers.indexOf('well_depth_va');
      if (latIdx < 0 || lngIdx < 0) continue;
      var wlat  = parseFloat(cols[latIdx]  || '');
      var wlng  = parseFloat(cols[lngIdx]  || '');
      var id    = (cols[idIdx] || '').trim();
      var depth = depthIdx >= 0 && cols[depthIdx] ? Math.round(parseFloat(cols[depthIdx])) : 0;
      if (!wlat || !wlng) continue;
      Logger.log('Well found: ' + id + ' at ' + wlat + ',' + wlng + ' depth=' + depth);
      wells.push(wlat.toFixed(5) + ',' + wlng.toFixed(5) + ',' + depth + ',' + id.replace(/,/g,''));
    }
    Logger.log('USGS total wells: ' + wells.length);
    return wells;
  } catch(e) {
    Logger.log('USGS fetch error: ' + e.message);
    return [];
  }
}

// ============================================================
// DIAGNOSE PARCEL API
// ============================================================
function diagnoseParcelAPI() {
  var ui     = SpreadsheetApp.getUi();
  var r1     = ui.prompt('Diagnose Parcel API', 'Enter parcel ID (e.g. XB00-2636):', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var parcel = r1.getResponseText().trim();
  var r2     = ui.prompt('Diagnose Parcel API', 'Enter county (e.g. Juab):', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var county = r2.getResponseText().trim();
  var svc    = SERVICES[county];
  var core   = parcel.replace(/-/g, '').replace(/^0+/, '');

  var tests = [
    ['Exact PARCEL_ID',         svc + '/query?where=' + encodeURIComponent("PARCEL_ID='" + parcel + "'") + '&outFields=PARCEL_ID,PARCEL_ADD&outSR=4326&f=json&resultRecordCount=3'],
    ['PARCEL_ID prefix %',      svc + '/query?where=' + encodeURIComponent("PARCEL_ID LIKE '" + parcel + "%'") + '&outFields=PARCEL_ID,PARCEL_ADD&outSR=4326&f=json&resultRecordCount=5'],
    ['PARCEL_ID contains core', svc + '/query?where=' + encodeURIComponent("PARCEL_ID LIKE '%" + core + "%'") + '&outFields=PARCEL_ID,PARCEL_ADD&outSR=4326&f=json&resultRecordCount=5'],
    ['ACCOUNT_NUM exact',       svc + '/query?where=' + encodeURIComponent("ACCOUNT_NUM='" + parcel + "'") + '&outFields=PARCEL_ID,ACCOUNT_NUM,PARCEL_ADD&outSR=4326&f=json&resultRecordCount=3'],
    ['Utah statewide',          'https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/UtahStatewideParcels/FeatureServer/0/query?where=' + encodeURIComponent("PARCEL_ID='" + parcel + "'") + '&outFields=PARCEL_ID,County,PARCEL_ADD&outSR=4326&f=json&resultRecordCount=3'],
  ];

  var msg = 'Testing ' + tests.length + ' endpoints for: ' + parcel + ' (' + county + ')\n\n';

  for (var i = 0; i < tests.length; i++) {
    var label = tests[i][0];
    var url   = tests[i][1];
    try {
      var res   = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var code  = res.getResponseCode();
      if (code !== 200) { msg += (i+1) + '. ' + label + ': HTTP ' + code + '\n'; continue; }
      var json  = JSON.parse(res.getContentText());
      if (json.error) { msg += (i+1) + '. ' + label + ': ' + json.error.message + '\n'; continue; }
      var feats = json.features || [];
      if (feats.length > 0) {
        msg += (i+1) + '. HIT: ' + label + ' - ' + feats.length + ' result(s)\n';
        for (var j = 0; j < feats.length; j++) {
          var a = feats[j].attributes || {};
          msg += '   -> ' + (a.PARCEL_ID || '?') + ' | ' + (a.PARCEL_ADD || a.ACCOUNT_NUM || '?') + '\n';
        }
      } else {
        msg += (i+1) + '. ' + label + ': no results\n';
      }
    } catch(e) {
      msg += (i+1) + '. ' + label + ': ' + e.message + '\n';
    }
  }

  ui.alert(msg);
}


// ============================================================
// SGID FIELD DIAGNOSIS — run once to see Juab field names
// ============================================================
function diagnoseSGID() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Diagnose SGID', 'Enter county name (e.g. Juab):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const county = resp.getResponseText().trim();
  if (!SERVICES[county]) { ui.alert('County not found: ' + county); return; }

  // Also ask for a specific parcel to test
  const resp2 = ui.prompt('Diagnose SGID', 'Enter parcel ID to test (optional):', ui.ButtonSet.OK_CANCEL);
  const testParcel = resp2.getSelectedButton() === ui.Button.OK ? resp2.getResponseText().trim() : '';

  try {
    // First get sample record to see field names
    const url  = SERVICES[county] + '/query?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=1';
    const res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());
    if (json.error) { ui.alert('SGID error: ' + json.error.message); return; }
    if (!json.features || json.features.length === 0) { ui.alert('No features returned for ' + county); return; }

    const attrs  = json.features[0].attributes || json.features[0].properties || {};
    const keys   = Object.keys(attrs);
    const sample = keys.map(k => k + ': ' + attrs[k]).slice(0, 15).join('\n');

    let msg = 'SGID Fields for ' + county + ' County:\n\n' + sample + '\n\n(First 15 fields shown)';

    // If parcel provided, try to find it
    if (testParcel) {
      msg += '\n\n--- PARCEL SEARCH: ' + testParcel + ' ---\n';
      const fields = ['PARCEL_ID','ParcelID','SERIAL','PARCELID','APN','TAX_ID','ACCOUNT_NUM'];
      const variants = [testParcel, testParcel.toUpperCase(), testParcel.replace(/-/g,''), testParcel + '-0000'];
      let found = false;
      for (const v of variants) {
        for (const f of fields) {
          try {
            const r2 = UrlFetchApp.fetch(SERVICES[county] + '/query?where=' + encodeURIComponent(f+"='"+v+"'") + '&outFields=PARCEL_ID,PARCEL_ADD&f=json&resultRecordCount=1', {muteHttpExceptions:true});
            const j2 = JSON.parse(r2.getContentText());
            if (j2.features && j2.features.length > 0) {
              const a2 = j2.features[0].attributes || {};
              msg += 'FOUND with ' + f + '=\'' + v + '\'\n';
              msg += 'PARCEL_ID: ' + a2.PARCEL_ID + '\nAddress: ' + a2.PARCEL_ADD;
              found = true; break;
            }
          } catch(e2) {}
          if (found) break;
        }
        if (found) break;
      }
      // Wildcard if not found
      if (!found) {
        try {
          const core = testParcel.replace(/-/g,'').replace(/^0+/,'');
          const r3 = UrlFetchApp.fetch(SERVICES[county] + '/query?where=' + encodeURIComponent("PARCEL_ID LIKE '%"+core+"%'") + '&outFields=PARCEL_ID,PARCEL_ADD&f=json&resultRecordCount=3', {muteHttpExceptions:true});
          const j3 = JSON.parse(r3.getContentText());
          if (j3.features && j3.features.length > 0) {
            msg += 'Wildcard matches for %' + core + '%:\n';
            j3.features.forEach(ft => { const a3 = ft.attributes||{}; msg += '  ' + a3.PARCEL_ID + ' — ' + a3.PARCEL_ADD + '\n'; });
          } else {
            msg += 'No match found for ' + testParcel + ' or wildcard %' + core + '%';
          }
        } catch(e3) { msg += 'Wildcard error: ' + e3.message; }
      }
    }

    ui.alert(msg);
  } catch(e) {
    ui.alert('Error: ' + e.message);
  }
}

// ============================================================
// MLS IMAGE FETCH
// ============================================================
function getMlsImage(mlsNum) {
  try {
    const html = UrlFetchApp.fetch(MLS_BASE + mlsNum, {
      muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' }
    }).getContentText();
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match ? match[1] : null;
  } catch(e) { return null; }
}

// ============================================================
// APPLY COLUMN FORMATS
// ============================================================
function applyColumnFormats(showSheet, lastDataRow) {
  if (lastDataRow < 3) return;
  const n = lastDataRow - 2;
  showSheet.getRange(3, 7, n, 1).setFontSize(9).setFontColor(NAVY).setVerticalAlignment('middle');
  showSheet.getRange(3, 8, n, 1).setFontColor(TERRACOTTA);
  showSheet.getRange(3, 9, n, 2).setFontColor(LINK_COLOR).setFontSize(9).setVerticalAlignment('middle').setWrap(true);
  showSheet.getRange(3, 11, n, 1).setFontColor(TERRACOTTA).setFontWeight('bold');
  showSheet.getRange(3, 12, n, 1).setFontColor(TERRACOTTA).setFontWeight('bold');
}


// ============================================================
// DEBUG — diagnose why land rows not detected
// ============================================================
function debugLandDetection() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName('MLS Data');
  const ui        = SpreadsheetApp.getUi();
  if (!dataSheet) { ui.alert('No MLS Data tab.'); return; }

  const blocks = parseDataBlocks(dataSheet);
  if (blocks.length === 0) { ui.alert('No blocks found — is your data in MLS Data tab?'); return; }

  let msg = 'Blocks found: ' + blocks.length + '\n\n';

  blocks.forEach((block, bi) => {
    const idx = block.idx;
    msg += 'BLOCK ' + (bi+1) + ':\n';
    msg += '  Rows: ' + block.rows.length + '\n';
    msg += '  acres col: ' + idx.acres + '\n';
    msg += '  sqft col: ' + idx.sqft + '\n';
    msg += '  zoning col: ' + idx.zoning + '\n';
    msg += '  mls col: ' + idx.mls + '\n';

    if (block.rows.length > 0) {
      const row = block.rows[0].data;
      const safe = (j) => (j !== -1 && j < row.length && row[j] != null) ? row[j].toString().trim() : 'N/A';
      msg += '  First row MLS: ' + safe(idx.mls) + '\n';
      msg += '  First row acres: ' + safe(idx.acres) + '\n';
      msg += '  First row zoning: ' + safe(idx.zoning) + '\n';
      msg += '  First row sqft: ' + safe(idx.sqft) + '\n';
      msg += '  isLand: ' + isLandRow(row, idx) + '\n';
    }
    msg += '\n';
  });

  ui.alert(msg);
}

// ============================================================
// onEdit — MLS# image fetch + Agent/Phone toggle
// ============================================================
function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'Showings') return;

  const col = e.range.getColumn();
  const row = e.range.getRow();

  // Toggle Agent/Phone visibility — checkbox in J2 (col 10)
  if (col === 10 && row === 2) {
    const show = e.range.getValue() === true;
    sheet.showColumns(11);  // K — Agent
    sheet.showColumns(12);  // L — Phone
    if (!show) {
      sheet.hideColumns(11);
      sheet.hideColumns(12);
    }
    return;
  }

  // Auto-fetch image when MLS# entered manually
  if (col === 5 && row > 2) {
    const formula  = sheet.getRange(row, 5).getFormula();
    const mlsMatch = formula.match(/"(\d{6,7})"/);
    const mls      = mlsMatch ? mlsMatch[1] : e.range.getValue().toString().trim();
    if (!mls) return;
    const imgUrl = getMlsImage(mls);
    if (imgUrl) sheet.getRange(row, 1).setFormula('=IMAGE("' + imgUrl + '",4,100,110)');
  }
}
