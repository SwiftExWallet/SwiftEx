import { zipSync, strToU8 } from 'fflate';
import CustomInfoProvider from '../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';
import RNFS from 'react-native-fs';
import { Alert, Platform } from 'react-native';

const S = Object.freeze({
  DEFAULT: 0, TITLE: 1, SUBTITLE: 2, HDR_NAVY: 3, HDR_BLUE: 4,
  KPI_LBL: 5, KPI_BLUE: 6, KPI_GREEN: 7, KPI_RED: 8,
  CELL: 9, CELL_ALT: 10, NUM: 11, NUM_ALT: 12,
  PNL_GREEN: 13, PNL_RED: 14, WARN_BG: 15,
  FORMULA_NUM: 16, FORMULA_G: 17, FORMULA_R: 18,
  TOTAL_LBL: 19, NUM_RIGHT: 20, EDITABLE: 21, EDITABLE_N: 22, SECTION: 23,
});

function xe(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function colLetter(n) {
  let s = '';
  while (n > 0) { s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function ref(r, c) { return `${colLetter(c)}${r}`; }

function makeSST() {
  const list = [], map = {};
  const add = (v) => {
    const k = String(v ?? '');
    if (map[k] === undefined) { map[k] = list.length; list.push(k); }
    return map[k];
  };
  const xml = () =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `count="${list.length}" uniqueCount="${list.length}">\n` +
    list.map(s => `<si><t xml:space="preserve">${xe(s)}</t></si>`).join('\n') +
    `\n</sst>`;
  return { add, xml };
}

const sc = (r, c, v, sId, sst) => `<c r="${ref(r, c)}" t="s" s="${sId}"><v>${sst.add(v)}</v></c>`;
const nc = (r, c, v, sId) => v == null
  ? `<c r="${ref(r, c)}" s="${sId}"/>`
  : `<c r="${ref(r, c)}" t="n" s="${sId}"><v>${Number(v)}</v></c>`;
const fc = (r, c, formula, sId, cachedVal) =>
  `<c r="${ref(r, c)}" t="n" s="${sId}"><f>${xe(formula)}</f>${cachedVal !== undefined ? `<v>${cachedVal}</v>` : ''}</c>`;
const row = (r, ht, cells) => `<row r="${r}" ht="${ht}" customHeight="1">${cells}</row>`;

function sheet(rowsXml, colsXml, mergesXml = '', freezeRow = 0) {
  const freeze = freezeRow > 0
    ? `<sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`
    : `<sheetView showGridLines="0" workbookViewId="0"/>`;
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`,
    `           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `  <sheetViews>${freeze}</sheetViews>`,
    `  <cols>${colsXml}</cols>`,
    `  <sheetData>${rowsXml}</sheetData>`,
    mergesXml,
    `</worksheet>`,
  ].join('\n');
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.0000"/>
    <numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/>
    <numFmt numFmtId="166" formatCode="#,##0.0000"/>
  </numFmts>
  <fonts count="10">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FF1E40AF"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FF166534"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FFB91C1C"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
  </fonts>
  <fills count="14">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1B365D"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2E75B6"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD6E4F0"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD5F5E3"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFADBD8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFDE68A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8F5E9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE4EC"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left   style="thin"><color rgb="FFCBD5E1"/></left>
      <right  style="thin"><color rgb="FFCBD5E1"/></right>
      <top    style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
    <border>
      <left   style="medium"><color rgb="FFFBBF24"/></left>
      <right  style="medium"><color rgb="FFFBBF24"/></right>
      <top    style="medium"><color rgb="FFFBBF24"/></top>
      <bottom style="medium"><color rgb="FFFBBF24"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="24">
    <xf numFmtId="0"   fontId="0" fillId="0"  borderId="0" xfId="0"/>
    <xf numFmtId="0"   fontId="1" fillId="2"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="0"/></xf>
    <xf numFmtId="0"   fontId="2" fillId="7"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0"   fontId="3" fillId="2"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0"   fontId="3" fillId="3"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0"   fontId="4" fillId="4"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="5" fillId="13" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="5"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="6"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0"   fontId="0" fillId="8"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0"   fontId="0" fillId="7"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="8"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="7"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0"   fontId="8" fillId="9"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="9" fillId="8"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0"   fontId="3" fillId="2"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="166" fontId="0" fillId="8"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="166" fontId="0" fillId="9"  borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="9"  borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0"   fontId="9" fillId="7"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildSummarySheet(d, sst,timeLinePeriod) {
  let rows = '';
  rows += row(1, 40, sc(1, 1, 'SwiftEx — Stellar DEX P&L Report', S.TITLE, sst));
  rows += row(2, 14, sc(2, 1, `Wallet: ${d.address}  ·  Period: ${timeLinePeriod}`, S.SUBTITLE, sst));
  rows += row(3, 8, '');
  rows += row(4, 32, sc(4, 1,
    '⚠  All positions start with $0 cost basis from the period start. Go to the "Cost Basis" sheet to enter your opening balances once per asset.',
    S.WARN_BG, sst));
  rows += row(5, 8, '');

  const kpiHeaders = ['Total Realized P&L', 'Total Unrealized P&L', 'Total P&L', 'USDC Spent', 'USDC Received', 'Net USDC Flow'];
  rows += row(6, 20, kpiHeaders.map((h, i) => sc(6, i + 1, h, S.KPI_LBL, sst)).join(''));

  const pnlS = (v) => v >= 0 ? S.KPI_GREEN : S.KPI_RED;
  rows += row(7, 32,
    nc(7, 1, d.totalRealized, pnlS(d.totalRealized)) +
    nc(7, 2, d.totalUnrealized, pnlS(d.totalUnrealized)) +
    nc(7, 3, d.totalPnL, pnlS(d.totalPnL)) +
    nc(7, 4, d.usdcSpent, S.KPI_BLUE) +
    nc(7, 5, d.usdcReceived, S.KPI_BLUE) +
    nc(7, 6, d.netUSDCFlow, pnlS(d.netUSDCFlow))
  );
  rows += row(8, 10, '');

  const cbPositions = d.positions?.length ?? 0;
  const cbTotalRow = 5 + Math.max(cbPositions, 5);
  const totalOpeningCostBasis = d.positions?.reduce((sum, pos) => sum + (pos.openingAmount ?? 0) * (pos.openingCostPerUnit ?? 0), 0) ?? 0;
  rows += row(9, 22,
    sc(9, 1, 'Adjusted Total P&L (fill Cost Basis sheet to activate)', S.SECTION, sst) +
    fc(9, 6, `${d.totalRealized}+'Cost Basis'!F${cbTotalRow}`, S.FORMULA_NUM, d.totalRealized + totalOpeningCostBasis)
  );
  rows += row(10, 10, '');


  rows += row(11, 20, sc(11, 1, 'Trade Statistics', S.HDR_NAVY, sst));
  const stats = [
    ['Raw Trade Legs', d.rawCount ?? d.tradeCount],
    ['Collapsed Trades', d.collapsedCount ?? d.tradeCount],
    ['Scam Tokens Found', d.skippedCount ?? 0],
    ['Unpriced Trades', d.noPriceCount ?? 0],
  ];
  stats.forEach(([label, val], i) => {
    const r = 12 + i;
    const alt = i % 2 === 0;
    rows += row(r, 17,
      sc(r, 1, label, alt ? S.CELL : S.CELL_ALT, sst) +
      nc(r, 2, val, S.NUM_RIGHT)
    );
  });

  const lastStatRow = 12 + stats.length - 1;
  rows += row(lastStatRow + 1, 10, '');


  const posHdrRow = lastStatRow + 2;
  rows += row(posHdrRow, 20, sc(posHdrRow, 1, 'Current Positions', S.HDR_NAVY, sst));
  const posColHdr = posHdrRow + 1;
  ['Asset', 'Remaining', 'Avg Cost', 'Current Price', 'Unrealized P&L', 'Realized P&L'].forEach((h, i) => {

  });
  rows += row(posColHdr, 18,
    ['Asset', 'Remaining', 'Avg Cost', 'Current Price', 'Unrealized P&L', 'Realized P&L']
      .map((h, i) => sc(posColHdr, i + 1, h, S.HDR_BLUE, sst)).join('')
  );

  const positions = d.positions ?? [];
  positions.forEach((pos, i) => {
    const r = posColHdr + 1 + i;
    const alt = i % 2 === 0;
    const bg = alt ? S.CELL : S.CELL_ALT;
    const nbg = alt ? S.NUM : S.NUM_ALT;
    const unrS = (pos.unrealized ?? 0) >= 0 ? S.PNL_GREEN : S.PNL_RED;
    const rzS = pos.realizedPnL >= 0 ? S.PNL_GREEN : S.PNL_RED;
    rows += row(r, 17,
      sc(r, 1, pos.asset, bg, sst) +
      nc(r, 2, pos.remaining, nbg) +
      nc(r, 3, pos.avgCost, nbg) +
      nc(r, 4, pos.currentPrice, nbg) +
      nc(r, 5, pos.unrealized, unrS) +
      nc(r, 6, pos.realizedPnL, rzS)
    );
  });

  if (positions.length === 0) {
    rows += row(posColHdr + 1, 17, sc(posColHdr + 1, 1, 'No position data available', S.CELL, sst));
  }

  const posTotalRow = posColHdr + 1 + Math.max(positions.length, 1);
  const posDataStart = posColHdr + 1;
  const posDataEnd = posColHdr + Math.max(positions.length, 1);
  rows += row(posTotalRow, 20,
    sc(posTotalRow, 1, 'TOTAL', S.TOTAL_LBL, sst) +
    sc(posTotalRow, 2, '', S.TOTAL_LBL, sst) +
    sc(posTotalRow, 3, '', S.TOTAL_LBL, sst) +
    sc(posTotalRow, 4, '', S.TOTAL_LBL, sst) +
    fc(posTotalRow, 5, `SUM(E${posDataStart}:E${posDataEnd})`, S.KPI_GREEN) +
    fc(posTotalRow, 6, `SUM(F${posDataStart}:F${posDataEnd})`, S.KPI_GREEN)
  );

  const cols = [
    `<col min="1" max="1" width="30" customWidth="1"/>`,
    `<col min="2" max="2" width="16" customWidth="1"/>`,
    `<col min="3" max="3" width="16" customWidth="1"/>`,
    `<col min="4" max="4" width="16" customWidth="1"/>`,
    `<col min="5" max="5" width="18" customWidth="1"/>`,
    `<col min="6" max="6" width="18" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="4">
    <mergeCell ref="A1:F1"/>
    <mergeCell ref="A2:F2"/>
    <mergeCell ref="A4:F4"/>
    <mergeCell ref="A11:B11"/>
  </mergeCells>`;

  return sheet(rows, cols, merges, 6);
}

function buildCostBasisSheet(d, sst) {
  let rows = '';
  rows += row(1, 36, sc(1, 1, 'Cost Basis — Fill In This Sheet (Yellow Cells)', S.TITLE, sst));
  rows += row(2, 40, sc(2, 1,
    '✏️  INSTRUCTIONS: For each asset held BEFORE this report period, enter how many tokens you held (Column D) and what you paid per token in USD (Column E). Leave blank if you only bought inside the report period.',
    S.WARN_BG, sst));
  rows += row(3, 8, '');

  const hdrs = [
    'Asset', 'Issuer',
    'Current Holdings\n(from wallet)',
    '← Opening Amount\n(tokens held before)',
    '← Cost Per Unit\n(USD you paid)',
    'Total Opening\nCost Basis ($)',
    'Unrealized P&L\n(approx)',
    'Auto-Fill Source'          // NEW column H
  ];
  rows += row(4, 40, hdrs.map((h, i) => sc(4, i + 1, h, S.HDR_NAVY, sst)).join(''));

  const positions  = d.positions    ?? [];
  const autoCB     = d.autoCostBasis ?? {};   // NEW

  // Build a lookup: asset symbol → autoCostBasis entry
  // autoCostBasis keys are like "XLM::native" or "BTC::GDPJ..."
  // positions have pos.asset (e.g. "XLM") and pos.issuer
  const autoLookup = {};
  for (const entry of Object.values(autoCB)) {
    // key by asset symbol; if duplicates exist keep the one whose issuer matches later
    autoLookup[entry.asset] = entry;
  }

  const dataStart = 5;
  const minRows   = Math.max(positions.length, 5);
  let totalOpeningCost = 0, totalUnrealized = 0;

  for (let i = 0; i < minRows; i++) {
    const pos  = positions[i];
    const r    = dataStart + i;
    const numS = i % 2 === 0 ? S.NUM : S.NUM_ALT;

    if (pos) {
      // Prefer explicit opening values already on pos; fall back to autoCostBasis
      const auto = autoLookup[pos.asset];

      const openingAmountVal  = pos.openingAmount      ?? auto?.amount ?? null;
      const openingCostVal    = pos.openingCostPerUnit ?? auto?.price  ?? null;
      const isAutoFilled      = (pos.openingAmount == null && auto?.amount != null)
                             || (pos.openingCostPerUnit == null && auto?.price != null);

      const openingTotalVal   = (openingAmountVal !== null && openingCostVal !== null)
                                  ? openingAmountVal * openingCostVal : 0;
      const currentPriceVal   = pos.currentPrice ?? 0;
      totalOpeningCost       += openingTotalVal;

      const cachedUnrealized  = (openingAmountVal !== null && openingCostVal !== null)
                                  ? (pos.remaining * currentPriceVal) - openingTotalVal : 0;
      totalUnrealized        += cachedUnrealized;

      // Style: use a slightly different editable style when auto-filled so users
      // can still see it's editable but know the value came from auto-fill.
      // We reuse S.EDITABLE / S.EDITABLE_N — they're yellow, which is perfect.
      const sourceLabel = isAutoFilled && auto
        ? `${auto.source ?? 'auto'} · ${auto.date ?? ''}`
        : '';

      rows += row(r, 22,
        sc(r, 1, pos.asset,  i % 2 === 0 ? S.CELL : S.CELL_ALT, sst) +
        sc(r, 2, pos.issuer ? `${pos.issuer.slice(0, 10)}...${pos.issuer.slice(-6)}` : 'Native / Stellar',
                 i % 2 === 0 ? S.CELL : S.CELL_ALT, sst) +
        nc(r, 3, pos.remaining,     numS) +
        nc(r, 4, openingAmountVal,  S.EDITABLE) +
        nc(r, 5, openingCostVal,    S.EDITABLE_N) +
        fc(r, 6, `IFERROR(D${r}*E${r},0)`,
                 S.FORMULA_NUM, openingTotalVal) +
        fc(r, 7, `IFERROR(C${r}*${currentPriceVal.toFixed(6)}-D${r}*E${r},"—")`,
                 S.FORMULA_NUM, cachedUnrealized) +
        sc(r, 8, sourceLabel, i % 2 === 0 ? S.CELL : S.CELL_ALT, sst)   // NEW
      );
    } else {
      rows += row(r, 22,
        sc(r, 1, '', S.CELL, sst) +
        sc(r, 2, '', S.CELL, sst) +
        sc(r, 3, '', S.CELL, sst) +
        nc(r, 4, null, S.EDITABLE) +
        nc(r, 5, null, S.EDITABLE_N) +
        fc(r, 6, `IFERROR(D${r}*E${r},0)`, S.FORMULA_NUM, 0) +
        fc(r, 7, `0`, S.FORMULA_NUM, 0) +
        sc(r, 8, '', S.CELL, sst)   // NEW
      );
    }
  }

  const dataEnd  = dataStart + minRows - 1;
  const totalRow = dataEnd + 1;
  rows += row(totalRow, 22,
    sc(totalRow, 1, 'TOTAL',  S.TOTAL_LBL, sst) +
    sc(totalRow, 2, '',       S.TOTAL_LBL, sst) +
    sc(totalRow, 3, '',       S.TOTAL_LBL, sst) +
    sc(totalRow, 4, '',       S.TOTAL_LBL, sst) +
    sc(totalRow, 5, '',       S.TOTAL_LBL, sst) +
    fc(totalRow, 6, `SUM(F${dataStart}:F${dataEnd})`, S.KPI_BLUE, totalOpeningCost) +
    fc(totalRow, 7, `SUM(G${dataStart}:G${dataEnd})`, S.KPI_BLUE, totalUnrealized)  +
    sc(totalRow, 8, '',       S.TOTAL_LBL, sst)   // NEW
  );

  const noteRow = totalRow + 2;
  rows += row(noteRow, 16, sc(noteRow, 1,
    '📌  Columns D & E are editable (yellow). Auto-filled values came from the price the day before the report period (Column H). All other cells auto-calculate.',
    S.SECTION, sst));

  const cols = [
    `<col min="1" max="1" width="12" customWidth="1"/>`,
    `<col min="2" max="2" width="24" customWidth="1"/>`,
    `<col min="3" max="3" width="18" customWidth="1"/>`,
    `<col min="4" max="4" width="22" customWidth="1"/>`,
    `<col min="5" max="5" width="20" customWidth="1"/>`,
    `<col min="6" max="6" width="22" customWidth="1"/>`,
    `<col min="7" max="7" width="20" customWidth="1"/>`,
    `<col min="8" max="8" width="34" customWidth="1"/>`,   // NEW
  ].join('');

  const merges = `<mergeCells count="3">
    <mergeCell ref="A1:H1"/>
    <mergeCell ref="A2:H2"/>
    <mergeCell ref="A${noteRow}:H${noteRow}"/>
  </mergeCells>`;

  return sheet(rows, cols, merges, 4);
}

function buildDisposalsSheet(d, sst) {
  let rows = '';
  rows += row(1, 36, sc(1, 1, 'Disposals — Tax Report', S.TITLE, sst));
  rows += row(2, 30, sc(2, 1,
    'Yellow rows = cost basis unknown. Cost per unit is pulled automatically from the "Cost Basis" sheet.',
    S.WARN_BG, sst));
  rows += row(3, 8, '');

  const hdrs = ['Date', 'Asset', 'Amount Sold', 'Proceeds ($)', 'API P&L ($)', 'Cost Per Unit\n(from Cost Basis)', 'Cost Basis ($)', 'Adjusted P&L ($)'];
  rows += row(4, 36, hdrs.map((h, i) => sc(4, i + 1, h, S.HDR_NAVY, sst)).join(''));

  const cbLookupRange = `'Cost Basis'!$A:$E`;
  const trades = d.trades ?? [];
  const disposals = trades.filter(t => t.type === 'SELL' || (t.type === 'SWAP' && t.pnlNum !== 0));
  const dataStart = 5;

  disposals.forEach((t, i) => {
    const r = dataStart + i;
    const assetMatch = t.amount.match(/^[\d.]+\s+(\S+)/);
    const assetSymbol = assetMatch ? assetMatch[1] : '';
    const proceeds = parseFloat(t.usdc.replace(/[^0-9.-]/g, '')) || 0;
    const amountSold = parseFloat(t.amount) || 0;
    const apiPnl = t.pnlNum ?? 0;
    const useStyle = i % 2 === 0 ? S.CELL : S.CELL_ALT;
    const numS = i % 2 === 0 ? S.NUM : S.NUM_ALT;
    const pnlS = apiPnl >= 0 ? S.PNL_GREEN : S.PNL_RED;
    const posObj = d.positions?.find(p => p.asset === assetSymbol);
    const cpuCached = posObj?.openingCostPerUnit ?? 0;
    const cbCached = amountSold * cpuCached;
    const adjCached = proceeds - cbCached;

    rows += row(r, 20,
      sc(r, 1, t.date, useStyle, sst) +
      sc(r, 2, assetSymbol, useStyle, sst) +
      nc(r, 3, amountSold, numS) +
      nc(r, 4, proceeds, numS) +
      nc(r, 5, apiPnl, pnlS) +
      fc(r, 6, `IFERROR(VLOOKUP(B${r},${cbLookupRange},5,FALSE),0)`, S.FORMULA_NUM, cpuCached) +
      fc(r, 7, `C${r}*F${r}`, S.FORMULA_NUM, cbCached) +
      fc(r, 8, `D${r}-G${r}`, adjCached >= 0 ? S.FORMULA_G : S.FORMULA_R, adjCached)
    );
  });

  if (disposals.length === 0) {
    rows += row(dataStart, 20, sc(dataStart, 1, 'No disposal events found in this period.', S.CELL, sst));
  }

  const dataEnd = dataStart + Math.max(disposals.length, 1) - 1;
  const totalRow = dataEnd + 1;
  let totalDisposalsCostBasis = 0, totalAdjustedPnl = 0;
  disposals.forEach(t => {
    const assetMatch = t.amount.match(/^[\d.]+\s+(\S+)/);
    const assetSymbol = assetMatch ? assetMatch[1] : '';
    const proceeds = parseFloat(t.usdc.replace(/[^0-9.-]/g, '')) || 0;
    const amountSold = parseFloat(t.amount) || 0;
    const posObj = d.positions?.find(p => p.asset === assetSymbol);
    const cpu = posObj?.openingCostPerUnit ?? 0;
    const cb = amountSold * cpu;
    totalDisposalsCostBasis += cb;
    totalAdjustedPnl += (proceeds - cb);
  });

  rows += row(totalRow, 22,
    sc(totalRow, 1, 'TOTAL', S.TOTAL_LBL, sst) +
    sc(totalRow, 2, '', S.TOTAL_LBL, sst) +
    fc(totalRow, 3, `SUM(C${dataStart}:C${dataEnd})`, S.KPI_BLUE, disposals.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)) +
    fc(totalRow, 4, `SUM(D${dataStart}:D${dataEnd})`, S.KPI_BLUE, disposals.reduce((s, t) => s + (parseFloat(t.usdc.replace(/[^0-9.-]/g, '')) || 0), 0)) +
    fc(totalRow, 5, `SUM(E${dataStart}:E${dataEnd})`, S.KPI_BLUE, disposals.reduce((s, t) => s + (t.pnlNum ?? 0), 0)) +
    sc(totalRow, 6, '', S.TOTAL_LBL, sst) +
    fc(totalRow, 7, `SUM(G${dataStart}:G${dataEnd})`, S.KPI_BLUE, totalDisposalsCostBasis) +
    fc(totalRow, 8, `SUM(H${dataStart}:H${dataEnd})`, S.KPI_BLUE, totalAdjustedPnl)
  );

  const cols = [
    `<col min="1" max="1" width="14" customWidth="1"/>`,
    `<col min="2" max="2" width="12" customWidth="1"/>`,
    `<col min="3" max="3" width="16" customWidth="1"/>`,
    `<col min="4" max="4" width="16" customWidth="1"/>`,
    `<col min="5" max="5" width="16" customWidth="1"/>`,
    `<col min="6" max="6" width="20" customWidth="1"/>`,
    `<col min="7" max="7" width="18" customWidth="1"/>`,
    `<col min="8" max="8" width="18" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="2">
    <mergeCell ref="A1:H1"/>
    <mergeCell ref="A2:H2"/>
  </mergeCells>`;

  return sheet(rows, cols, merges, 4);
}

function buildTradeLogSheet(d, sst) {
  let rows = '';
  rows += row(1, 36, sc(1, 1, 'Full Trade Log', S.TITLE, sst));

  const hdrs = ['Date', 'Type', 'Action', 'Amount', 'Price', 'USDC Value', 'P&L', 'Price Source'];
  rows += row(2, 22, hdrs.map((h, i) => sc(2, i + 1, h, S.HDR_NAVY, sst)).join(''));

  const trades = d.trades ?? [];
  trades.forEach((t, i) => {
    const r = i + 3;
    const alt = i % 2 === 0;
    const bg = alt ? S.CELL : S.CELL_ALT;
    const nbg = alt ? S.NUM : S.NUM_ALT;
    const pnlS = (t.pnlNum ?? 0) > 0 ? S.PNL_GREEN : (t.pnlNum ?? 0) < 0 ? S.PNL_RED : nbg;
    const typeStyle = t.type === 'BUY' ? S.PNL_GREEN : t.type === 'SELL' ? S.PNL_RED : S.KPI_BLUE;

    rows += row(r, 16,
      sc(r, 1, t.date, bg, sst) +
      sc(r, 2, t.type, typeStyle, sst) +
      sc(r, 3, t.action, bg, sst) +
      sc(r, 4, t.amount, bg, sst) +
      sc(r, 5, t.price, nbg, sst) +
      sc(r, 6, t.usdc, nbg, sst) +
      sc(r, 7, t.pnl ?? '', pnlS, sst) +
      sc(r, 8, t.source ?? '', bg, sst)
    );
  });

  if (trades.length === 0) {
    rows += row(3, 16, sc(3, 1, 'No trade data available for this period.', S.CELL, sst));
  }

  const dataStart = 3;
  const dataEnd = dataStart + Math.max(trades.length, 1) - 1;
  const totalRow = dataEnd + 1;
  rows += row(totalRow, 22, sc(totalRow, 1, `TOTAL (${trades.length} trades)`, S.TOTAL_LBL, sst));

  const cols = [
    `<col min="1" max="1" width="14" customWidth="1"/>`,
    `<col min="2" max="2" width="9"  customWidth="1"/>`,
    `<col min="3" max="3" width="16" customWidth="1"/>`,
    `<col min="4" max="4" width="36" customWidth="1"/>`,
    `<col min="5" max="5" width="18" customWidth="1"/>`,
    `<col min="6" max="6" width="14" customWidth="1"/>`,
    `<col min="7" max="7" width="14" customWidth="1"/>`,
    `<col min="8" max="8" width="30" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>`;
  return sheet(rows, cols, merges, 2);
}

function rel(id, type, target) {
  const base = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  return `<Relationship Id="${id}" Type="${base}${type}" Target="${target}"/>`;
}

export async function buildXlsxZip(d,timeLinePeriod) {
  try {
    const sst = makeSST();
    const s1 = buildSummarySheet(d, sst,timeLinePeriod);
    const s2 = buildCostBasisSheet(d, sst);
    const s3 = buildDisposalsSheet(d, sst);
    const s4 = buildTradeLogSheet(d, sst);
    const sstXml = sst.xml();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"          ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml"     ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml"            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel('rId1', 'officeDocument', 'xl/workbook.xml')}
</Relationships>`;

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary"    sheetId="1" r:id="rId1"/>
    <sheet name="Cost Basis" sheetId="2" r:id="rId2"/>
    <sheet name="Disposals"  sheetId="3" r:id="rId3"/>
    <sheet name="Trade Log"  sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`;

    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel('rId1', 'worksheet', 'worksheets/sheet1.xml')}
  ${rel('rId2', 'worksheet', 'worksheets/sheet2.xml')}
  ${rel('rId3', 'worksheet', 'worksheets/sheet3.xml')}
  ${rel('rId4', 'worksheet', 'worksheets/sheet4.xml')}
  ${rel('rId5', 'styles', 'styles.xml')}
  ${rel('rId6', 'sharedStrings', 'sharedStrings.xml')}
</Relationships>`;

    const zipdata = zipSync({
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rootRels),
      'xl/workbook.xml': strToU8(workbook),
      'xl/_rels/workbook.xml.rels': strToU8(wbRels),
      'xl/styles.xml': strToU8(stylesXml()),
      'xl/sharedStrings.xml': strToU8(sstXml),
      'xl/worksheets/sheet1.xml': strToU8(s1),
      'xl/worksheets/sheet2.xml': strToU8(s2),
      'xl/worksheets/sheet3.xml': strToU8(s3),
      'xl/worksheets/sheet4.xml': strToU8(s4),
    }, { level: 6 });
    const iosFilePath = `${RNFS.DocumentDirectoryPath}/PnlReport_${Date.now()}.xlsx`
    const path = `/storage/emulated/0/Download/PnlReport_${Date.now()}.xlsx`;
    const base64Data = Buffer.from(zipdata).toString('base64');
    await RNFS.writeFile(Platform.OS === "android" ? path : iosFilePath, base64Data, 'base64');
    if (Platform.OS === "ios") {
      Alert.alert("Export Successful", "Your report has been generated successfully and saved in the SwiftEx Wallet folder under On My iPhone.");
    } else {
      CustomInfoProvider.hide();
      CustomInfoProvider.show("success", "Export Successful", "Your report has been generated and saved in downloads successfully.");
    }
  } catch (error) {
    console.info("error in xlsc", error)
    if (Platform.OS === "ios") {
      Alert.alert("Export Failed", "Unable to generate or save the report. Please try again.");
    } else {
      CustomInfoProvider.show("error", "Export Failed", "Unable to generate or save the report. Please try again.");
    }
  }
}
