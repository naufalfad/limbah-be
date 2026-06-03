import ExcelJS from 'exceljs';

interface ParsedSheet {
  name: string;
  headers: string[];
  rows: string[][];
}

/**
 * Mengurai file Excel (.xlsx) dari buffer menjadi format JSON terstruktur.
 * Membatasi pembacaan hingga 500 baris pertama untuk performa & keamanan.
 */
export async function parseExcelBuffer(buffer: any): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const parsedSheets: ParsedSheet[] = [];

  workbook.eachSheet((worksheet) => {
    // Abaikan sheet jika tidak ada data
    if (worksheet.rowCount === 0) return;

    const sheetName = worksheet.name;
    const headers: string[] = [];
    const rows: string[][] = [];
    
    // Tentukan baris pertama sebagai Header
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell({ includeEmpty: true }, (cell) => {
      const cellVal = cell.value;
      if (cellVal && typeof cellVal === 'object' && 'result' in cellVal) {
        headers.push(String(cellVal.result || ''));
      } else {
        headers.push(cellVal ? String(cellVal) : '');
      }
    });

    // Batasi pembacaan baris demi keamanan dan performa (maks 500 baris)
    const maxRows = Math.min(worksheet.rowCount, 501); 
    
    for (let i = 2; i <= maxRows; i++) {
      const row = worksheet.getRow(i);
      const rowData: string[] = [];
      
      // Ambil nilai setiap kolom berdasarkan index header
      for (let colIdx = 1; colIdx <= headers.length; colIdx++) {
        const cell = row.getCell(colIdx);
        const cellVal = cell.value;
        
        if (cellVal && typeof cellVal === 'object') {
          if ('result' in cellVal) {
            rowData.push(String(cellVal.result || ''));
          } else if ('richText' in cellVal && Array.isArray(cellVal.richText)) {
            rowData.push(cellVal.richText.map(rt => rt.text).join(''));
          } else {
            rowData.push('');
          }
        } else {
          rowData.push(cellVal !== null && cellVal !== undefined ? String(cellVal) : '');
        }
      }
      
      // Simpan jika baris tidak kosong sepenuhnya
      if (rowData.some(val => val.trim() !== '')) {
        rows.push(rowData);
      }
    }

    parsedSheets.push({
      name: sheetName,
      headers,
      rows
    });
  });

  return parsedSheets;
}
