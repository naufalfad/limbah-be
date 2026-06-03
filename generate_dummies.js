const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function createExcel(filename, headers, data) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  data.forEach(row => sheet.addRow(row));
  const outputPath = path.join(__dirname, filename);
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Excel file created at ${outputPath}`);
}

function createPdf(filename) {
  const doc = new PDFDocument();
  const outputPath = path.join(__dirname, filename);
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);
  doc.fontSize(16).text('Dokumen AMDAL - Dummy Test File', 100, 100);
  doc.fontSize(12).text('Ini adalah file dummy untuk pengetesan sistem E-Limbah.', 100, 150);
  doc.end();
  console.log(`PDF file created at ${outputPath}`);
}

async function run() {
  createPdf('dummy.pdf');
  await createExcel('rkl_dummy.xlsx', 
    ['Nomor', 'Kegiatan Pengelolaan', 'Lokasi Pengelolaan', 'Periode Pengelolaan'],
    [
      ['1', 'Pengelolaan Limbah B3', 'Gedung A', 'Setiap Bulan'],
      ['2', 'Pengolahan Air Limbah', 'Instalasi IPAL', 'Setiap Hari']
    ]
  );
  await createExcel('rpl_dummy.xlsx',
    ['Nomor', 'Aspek Pemantauan', 'Lokasi Pemantauan', 'Metode Pemantauan'],
    [
      ['1', 'Kualitas Udara Emisi', 'Cerobong Pabrik', 'Setiap 6 Bulan'],
      ['2', 'Kualitas Air Sungai', 'Sungai Hilir', 'Setiap 3 Bulan']
    ]
  );
}

run().catch(console.error);
