// ============================================================
// Lance Anderson — Land Showing Sheet  v43
// ============================================================
// Showings tab — unified land + residential, auto-detected
// Data tab — multiple MLS paste blocks, each with own header
// v41 — Maps API key via 🔑 menu (Script Properties), no key in code
// v43 — Column I = single 🔗 Property Links button (links.html v2)
//     — Wells: Utah DWR Well Logs w/ WIN drilling-log links (USGS dead)
//     — SGID lookup slimmed: PARCEL_ID only (4 queries vs 64)
//     — GPS caching: auto-adds 'GPS Coords (auto)' column, writes back
//     — Fixed off-by-one row in GPS write-back
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
const MAPS_KEY    = PropertiesService.getScriptProperties().getProperty('MAPS_KEY') || '';
const TOOLS_BASE  = 'https://lancea141-source.github.io/utah-parcel-lookup/';
const LINKS_PAGE  = TOOLS_BASE + 'links.html';
const APP_VERSION = 'v43';

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
function recorderUrl(county, taxId, lat, lng) {
  const id = (taxId || '').split('&')[0].trim();

  if (county === 'Utah' && id) {
    const serial = id.replace(/\D/g, '');
    if (serial.length >= 7) {
      return 'https://www.utahcounty.gov/landrecords/property.asp?av_serial=' + serial;
    }
  }

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

  return coParcelUrl(taxId) || RECORDERS[county] || '';
}

// ============================================================
// CUSTOM MENU
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🌄 Showing Sheet ' + APP_VERSION)
    .addItem('▶ Sync & Build (Full Run)', 'syncAndBuild')
    .addSeparator()
    .addItem('↺ Sync Data Only', 'syncAllData')
    .addItem('📸 Reload Images', 'fetchAllImages')
    .addItem('🚗 Rebuild Directions Link', 'buildDirectionsLink')
    .addSeparator()
    .addItem('⚙️ Setup Sheet (first time only)', 'setupSheet')
    .addItem('🔑 Set Maps API Key', 'setMapsKey')
    .addItem('🐛 Diagnose SGID Field Names', 'diagnoseSGID')
    .addItem('🔍 Debug Land Detection', 'debugLandDetection')
    .addToUi();
}

// ============================================================
// SET MAPS API KEY — stored in Script Properties, not code
// ============================================================
function setMapsKey() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Maps API Key',
    'Paste your Google Maps API key.\nStored privately in this sheet\u2019s script — never in the code.',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const key = resp.getResponseText().trim();
  if (!key) { ui.alert('No key entered — nothing saved.'); return; }
  PropertiesService.getScriptProperties().setProperty('MAPS_KEY', key);
  ui.alert('✅ Key saved.\n\nRun 📸 Reload Images to refresh satellite photos.');
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
    '✅ Sheet is ready! (' + APP_VERSION + ')\n\n' +
    'HOW TO USE THE MLS DATA TAB:\n' +
    '• Paste any MLS report (with its header row) starting at row 1\n' +
    '• Paste another report below it — header row + data\n' +
    '• EVERY report needs its own header row — even if similar\n' +
    '• Mix land and residential — the script auto-detects each\n\n' +
    'Then run: 🌄 Showing Sheet > ▶ Sync & Build'
  );
}

function setupDataTab(sheet) {
  sheet.clear();
  sheet.getRange(1, 1, 1, 10).merge()
    .setValue('📋 MLS DATA — Paste your MLS reports here (row 1+). EVERY report must include its own header row. Mix land and residential freely.')
    .setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
}

// ============================================================
// SHEET STRUCTURE
// ============================================================
function buildSheetStructure(showSheet) {

  var colWidths = [120,80,200,120,75,90,170,200,120,90,100,110];
  for (var c = 0; c < colWidths.length; c++) {
    showSheet.setColumnWidth(c + 1, colWidths[c]);
  }

  showSheet.setRowHeight(1, 90);
  showSheet.getRange(1, 1, 1, 12).setBackground(NAVY).setFontColor(WHITE);

  showSheet.getRange(1, 1)
    .setFormula('=IMAGE("' + LOGO_URL + '",4,80,110)')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  showSheet.getRange(1, 3)
    .setValue('Run Sync & Build to generate directions link')
    .setFontColor(TERRACOTTA)
    .setFontWeight('bold')
    .setFontSize(12)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  showSheet.getRange(1, 9, 1, 2).merge()
    .setValue('Customer Name' + '\n' + 'Customer Email' + '\n' + 'Customer Phone #')
    .setBackground(NAVY)
    .setFontColor(WHITE)
    .setFontSize(11)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setWrap(true);

  showSheet.getRange(1, 11, 1, 2)
    .setValue('')
    .setBackground(NAVY);

  showSheet.setRowHeight(2, 32);
  showSheet.getRange(2, 1, 1, 12)
    .setBackground(TERRACOTTA)
    .setFontColor(CREAM)
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setValues([['Photo','Time','Address','Price','MLS#','Status','Details','Notes','Links','','Agent','Phone']]);

  showSheet.getRange(2, 10)
    .clearContent()
    .insertCheckboxes()
    .setValue(true)
    .setBackground(TERRACOTTA)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setNote('Checked = Agent & Phone visible\nUnchecked = hidden from customers');

  showSheet.getRange(2, 11, 1, 2)
    .setBackground(TERRACOTTA)
    .setFontColor(CREAM);

  showSheet.setFrozenRows(2);

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

  if (propType.match(/land|lot|acreage|farm|ranch/)) return true;
  if (zoning.match(/agricult|rural|range|farm|forest|open space/)) return true;
  if (acres >= 5) return true;
  if (taxId && idx.sqft === -1) return true;
  if (taxId && water && sqft === 0) return true;
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
  let currentHeadRow = 0;

  for (let r = 0; r < allValues.length; r++) {
    const row = allValues[r];
    const rowStr = row.map(c => c.toString().trim());

    const mlsCol = rowStr.findIndex(c => c === 'MLS#' || c === 'MLS Number' || c === 'MLS');
    if (mlsCol !== -1) {
      if (currentHeaders) {
        blocks.push({ headers: currentHeaders, idx: currentIdx, rows: currentRows, headerSheetRow: currentHeadRow });
        Logger.log('Block saved: ' + currentRows.length + ' rows');
      }
      currentHeaders = rowStr;
      currentIdx     = makeIdx(rowStr);
      currentRows    = [];
      currentHeadRow = r + 1;
      Logger.log('New header block at sheet row ' + (r + 1) + ': MLS# at col ' + mlsCol);
      continue;
    }

    if (rowStr.every(c => c === '')) continue;

    if (currentHeaders) {
      currentRows.push({ data: row, sheetRow: r + 1 });
    }
  }

  if (currentHeaders && currentRows.length > 0) {
    blocks.push({ headers: currentHeaders, idx: currentIdx, rows: currentRows, headerSheetRow: currentHeadRow });
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
  SpreadsheetApp.getUi().alert('✅ Done! (' + APP_VERSION + ')\nData synced, images loaded, directions built.');
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

  const lastRow = showSheet.getLastRow();
  if (lastRow >= 3) {
    showSheet.getRange(3, 1, lastRow - 2, 12).clearContent().clearFormat();
  }

  showSheet.getRange(2, 9).setValue('Links');

  const blocks = parseDataBlocks(dataSheet);
  if (blocks.length === 0) {
    SpreadsheetApp.getUi().alert('No data found. Paste your MLS reports into the MLS Data tab.');
    return;
  }

  let sheetRow = 3;

  for (const block of blocks) {
    const { headers, rows, headerSheetRow } = block;
    const idx = block.idx;

    if (idx.gpsCoords === -1) {
      const gpsCol = headers.length + 1;
      dataSheet.getRange(headerSheetRow, gpsCol).setValue('GPS Coords (auto)');
      idx.gpsCoords = gpsCol - 1;
      Logger.log('Added GPS Coords (auto) column at col ' + gpsCol + ' for block at row ' + headerSheetRow);
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
        let   gpsFresh  = false;

        if (!gpsCoords && taxId && county && isLand) {
          const primaryId = taxId.split('&')[0].trim();
          const sgid = fetchParcelFromSGID(primaryId, county);
          if (sgid && sgid.coords) {
            gpsCoords = sgid.coords;
            gpsFresh  = true;
            Logger.log('SGID GPS for ' + primaryId + ': ' + gpsCoords);
          } else {
            Logger.log('SGID miss: ' + primaryId + ' | ' + county);
          }
        }

        if (!gpsCoords && !address && (city || county)) {
          const geocoded = geocodeLocation(city, county);
          if (geocoded) {
            gpsCoords = geocoded;
            gpsFresh  = true;
          } else if (county && COUNTY_CENTROIDS[county]) {
            gpsCoords = COUNTY_CENTROIDS[county];
          }
        }

        if (gpsFresh && gpsCoords && idx.gpsCoords !== -1) {
          dataSheet.getRange(dataSheetRow, idx.gpsCoords + 1).setValue(gpsCoords);
        }

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

        let hoaDisplay = '';
        if (hoa.toLowerCase() === 'yes') hoaDisplay = hoaFee ? 'HOA: $' + hoaFee + '/yr' : 'HOA: Yes';
        else if (hoa.toLowerCase() === 'no') hoaDisplay = 'HOA: No';

        const phone        = phone1 || phone2;
        const phoneRaw     = phone.replace(/\D/g, '');
        const phoneDisplay = phoneRaw.length === 10
          ? '(' + phoneRaw.slice(0,3) + ') ' + phoneRaw.slice(3,6) + '-' + phoneRaw.slice(6) : phone;

        const gpsClean   = gpsCoords ? gpsCoords.replace(/\s/g,'') : '';
        const lat        = gpsClean ? gpsClean.split(',')[0] : '';
        const lng        = gpsClean ? gpsClean.split(',')[1] : '';
        const fullAddress = [address, city, 'UT'].filter(Boolean).join(', ');
        const mapUrl     = gpsClean
          ? 'https://www.google.com/maps/search/?api=1&query=' + gpsClean
          : 'https://maps.google.com/?q=' + encodeURIComponent(fullAddress);

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

        const photoCell = showSheet.getRange(sheetRow, 1);
        const mlsImgUrl = getMlsImage(mls);
        let imgUrl = '';
        if (mlsImgUrl) {
          imgUrl = mlsImgUrl;
          photoCell.setFormula('=IMAGE("' + mlsImgUrl + '",4,100,110)');
        } else if (gpsClean && gpsClean.includes(',')) {
          imgUrl = 'https://maps.googleapis.com/maps/api/staticmap?center=' + lat + ',' + lng +
            '&zoom=15&size=400x200&maptype=satellite&markers=color:red%7C' + lat + ',' + lng +
            '&key=' + MAPS_KEY;
          photoCell.setFormula('=IMAGE("' + imgUrl + '",4,100,110)');
        } else {
          photoCell.setValue('No image').setFontColor('#aaaaaa').setFontStyle('italic');
        }
        photoCell.setBackground(bg).setHorizontalAlignment('center').setVerticalAlignment('middle');
        showSheet.setRowHeight(sheetRow, 110);

        showSheet.getRange(sheetRow, 2).setValue('')
          .setBackground(bg).setHorizontalAlignment('center').setVerticalAlignment('middle')
          .setFontColor(TERRACOTTA).setFontWeight('bold').setFontSize(12)
          .setWrap(true);

        const addrLine1   = address || (isLand && acres ? acres + ' acres' : '') || city || 'Unknown';
        const addrLine2   = city ? city + ', UT' : 'UT';
        const pinLabel    = gpsClean ? ' 📍' : '';
        const addrDisplay = addrLine1 + '\n' + addrLine2 + pinLabel;
        showSheet.getRange(sheetRow, 3)
          .setFormula('=HYPERLINK("' + mapUrl + '","' + addrDisplay.replace(/"/g,"'") + '")')
          .setBackground(bg).setFontSize(11).setVerticalAlignment('middle')
          .setFontColor(LINK_COLOR).setWrap(true);

        showSheet.getRange(sheetRow, 4).setValue(priceDisplay)
          .setBackground(bg).setFontWeight('bold').setFontSize(11)
          .setFontColor(NAVY).setVerticalAlignment('middle').setWrap(true);

        showSheet.getRange(sheetRow, 5)
          .setFormula('=HYPERLINK("' + MLS_BASE + mls + '","' + mls + '")')
          .setBackground(bg).setFontSize(11)
          .setHorizontalAlignment('center').setVerticalAlignment('middle')
          .setFontColor(LINK_COLOR);

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

        showSheet.getRange(sheetRow, 7).setValue(detailLines.join('\n'))
          .setBackground(bg).setHorizontalAlignment('left').setVerticalAlignment('top')
          .setFontSize(9).setFontColor(NAVY).setVerticalAlignment('middle').setWrap(true);

        showSheet.getRange(sheetRow, 8).setValue('')
          .setBackground(bg).setVerticalAlignment('top').setHorizontalAlignment('left')
          .setFontColor(TERRACOTTA).setFontSize(10).setWrap(true);

        const wells = (isLand && lat && lng && taxId)
          ? fetchUSGSWells(parseFloat(lat), parseFloat(lng)) : [];
        buildLinksButton(showSheet, sheetRow, 9, bg, {
          isLand: isLand, addr: address, city: city, county: county,
          taxId: taxId, mls: mls, acres: acres, lat: lat, lng: lng,
          imgUrl: imgUrl, wells: wells
        });

        showSheet.getRange(sheetRow, 11).setValue(agent)
          .setBackground(bg).setVerticalAlignment('middle').setHorizontalAlignment('left')
          .setFontColor(TERRACOTTA).setFontWeight('bold').setFontSize(10).setWrap(true);

        showSheet.getRange(sheetRow, 12).setValue(phone ? '📞 ' + phoneDisplay : '')
          .setBackground(bg).setVerticalAlignment('middle').setHorizontalAlignment('left')
          .setFontColor(TERRACOTTA).setFontWeight('bold').setFontSize(10).setWrap(true);

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

// ============================================================
// 🔗 PROPERTY LINKS BUTTON — one tap-friendly page per property
// ============================================================
function buildLinksButton(sheet, row, col, bg, o) {
  const p = [];
  const add = (k, v) => { if (v) p.push(k + '=' + encodeURIComponent(v)); };

  add('addr', o.addr);
  add('city', o.city);
  add('mls',  o.mls);
  add('lat',  o.lat);
  add('lng',  o.lng);

  if (o.isLand) {
    const primaryId = o.taxId ? o.taxId.split('&')[0].trim() : '';
    add('county', o.county);
    add('parcel', primaryId);
    add('acres',  o.acres);
    add('rec',    recorderUrl(o.county, o.taxId, o.lat, o.lng));
    if (o.wells && o.wells.length) add('wl', o.wells.join('|'));
  }

  add('img', o.imgUrl);

  const url = LINKS_PAGE + '?' + p.join('&');
  sheet.getRange(row, col)
    .setFormula('=HYPERLINK("' + url + '","🔗 Property\nLinks")')
    .setBackground(bg).setFontColor(LINK_COLOR).setFontSize(12).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);

  sheet.getRange(row, col + 1).setValue('').setBackground(bg);
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
// SGID PARCEL LOOKUP — PARCEL_ID standardized across counties
// ============================================================
function fetchParcelFromSGID(parcelId, county) {
  if (!parcelId || !county || !SERVICES[county]) return null;
  const serviceUrl = SERVICES[county];
  const variants = [...new Set([
    parcelId,
    parcelId.replace(/-/g, ''),
    parcelId.toUpperCase(),
    parcelId.replace(/-/g, '').replace(/^0+/, ''),
  ])];

  for (const variant of variants) {
    try {
      const url  = serviceUrl + '/query?where=' + encodeURIComponent("PARCEL_ID='" + variant + "'") +
                   '&outFields=*&outSR=4326&f=geojson';
      const json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
      if (json.features && json.features.length > 0) {
        return extractCoordsFromFeature(json.features[0]);
      }
    } catch(e) {}
  }

  const core = parcelId.replace(/-/g, '').replace(/^0+/, '');
  try {
    const url  = serviceUrl + '/query?where=' + encodeURIComponent("PARCEL_ID LIKE '%" + core + "%'") +
                 '&outFields=*&outSR=4326&f=geojson&resultRecordCount=1';
    const json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    if (json.features && json.features.length > 0) {
      Logger.log('Wildcard hit for %' + core + '%');
      return extractCoordsFromFeature(json.features[0]);
    }
  } catch(e) {}

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
// FETCH NEARBY WELLS — Utah DWR Well Logs (nightly updated)
// Format: lat,lng,depth,waterRight,WIN — WIN links to drilling log
// ============================================================
function fetchUSGSWells(lat, lng) {
  var R    = 0.029; // ~2 miles
  var geom = (lng - R).toFixed(5) + ',' + (lat - R).toFixed(5) + ',' +
             (lng + R).toFixed(5) + ',' + (lat + R).toFixed(5);
  var url  = 'https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Utah_Well_Logs/FeatureServer/0/query' +
             '?where=1%3D1&geometry=' + geom +
             '&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326' +
             '&outFields=WIN,WRCHEX,Owner,Latitude,Longitude&f=json&resultRecordCount=50';
  try {
    var json  = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    var wells = [];
    (json.features || []).forEach(function(ft) {
      var a = ft.attributes || {};
      var g = ft.geometry   || {};
      var wlat = a.Latitude  || g.y;
      var wlng = a.Longitude || g.x;
      if (!wlat || !wlng) return;
      var wr  = (a.WRCHEX || '').toString().replace(/[,|]/g, '');
      var win = (a.WIN    || '').toString().replace(/[,|]/g, '');
      wells.push(wlat.toFixed(5) + ',' + wlng.toFixed(5) + ',0,' + wr + ',' + win);
    });
    Logger.log('DWR wells found: ' + wells.length);
    return wells;
  } catch (e) {
    Logger.log('DWR wells error: ' + e.message);
    return [];
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
  showSheet.getRange(3, 9, n, 1).setFontColor(LINK_COLOR).setVerticalAlignment('middle').setWrap(true);
  showSheet.getRange(3, 11, n, 1).setFontColor(TERRACOTTA).setFontWeight('bold');
  showSheet.getRange(3, 12, n, 1).setFontColor(TERRACOTTA).setFontWeight('bold');
}

// ============================================================
// SGID FIELD DIAGNOSIS
// ============================================================
function diagnoseSGID() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Diagnose SGID', 'Enter county name (e.g. Juab):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const county = resp.getResponseText().trim();
  if (!SERVICES[county]) { ui.alert('County not found: ' + county); return; }

  const resp2 = ui.prompt('Diagnose SGID', 'Enter parcel ID to test (optional):', ui.ButtonSet.OK_CANCEL);
  const testParcel = resp2.getSelectedButton() === ui.Button.OK ? resp2.getResponseText().trim() : '';

  try {
    const url  = SERVICES[county] + '/query?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=1';
    const res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());
    if (json.error) { ui.alert('SGID error: ' + json.error.message); return; }
    if (!json.features || json.features.length === 0) { ui.alert('No features returned for ' + county); return; }

    const attrs  = json.features[0].attributes || json.features[0].properties || {};
    const keys   = Object.keys(attrs);
    const sample = keys.map(k => k + ': ' + attrs[k]).slice(0, 15).join('\n');

    let msg = 'SGID Fields for ' + county + ' County:\n\n' + sample + '\n\n(First 15 fields shown)';

    if (testParcel) {
      msg += '\n\n--- PARCEL SEARCH: ' + testParcel + ' ---\n';
      const result = fetchParcelFromSGID(testParcel, county);
      if (result && result.coords) {
        msg += 'FOUND — GPS: ' + result.coords;
        if (result.owner) msg += '\nOwner: ' + result.owner;
        if (result.acres) msg += '\nAcres: ' + result.acres;
      } else {
        msg += 'No match found.';
      }
    }

    ui.alert(msg);
  } catch(e) {
    ui.alert('Error: ' + e.message);
  }
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

  let msg = 'Script ' + APP_VERSION + ' — Blocks found: ' + blocks.length + '\n\n';

  blocks.forEach((block, bi) => {
    const idx = block.idx;
    msg += 'BLOCK ' + (bi+1) + ' (header at sheet row ' + block.headerSheetRow + '):\n';
    msg += '  Rows: ' + block.rows.length + '\n';
    msg += '  acres col: ' + idx.acres + '\n';
    msg += '  sqft col: ' + idx.sqft + '\n';
    msg += '  zoning col: ' + idx.zoning + '\n';
    msg += '  mls col: ' + idx.mls + '\n';
    msg += '  gps col: ' + idx.gpsCoords + '\n';

    if (block.rows.length > 0) {
      const row = block.rows[0].data;
      const safe = (j) => (j !== -1 && j < row.length && row[j] != null) ? row[j].toString().trim() : 'N/A';
      msg += '  First row MLS: ' + safe(idx.mls) + '\n';
      msg += '  First row acres: ' + safe(idx.acres) + '\n';
      msg += '  First row county: ' + safe(idx.county) + '\n';
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

  if (col === 10 && row === 2) {
    const show = e.range.getValue() === true;
    sheet.showColumns(11);
    sheet.showColumns(12);
    if (!show) {
      sheet.hideColumns(11);
      sheet.hideColumns(12);
    }
    return;
  }

  if (col === 5 && row > 2) {
    const formula  = sheet.getRange(row, 5).getFormula();
    const mlsMatch = formula.match(/"(\d{6,7})"/);
    const mls      = mlsMatch ? mlsMatch[1] : e.range.getValue().toString().trim();
    if (!mls) return;
    const imgUrl = getMlsImage(mls);
    if (imgUrl) sheet.getRange(row, 1).setFormula('=IMAGE("' + imgUrl + '",4,100,110)');
  }
}
