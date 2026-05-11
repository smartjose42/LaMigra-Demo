const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Adobe PDF Services credentials — fill these in before use
const ADOBE_CLIENT_ID = 'CLIENT_ID';
const ADOBE_CLIENT_SECRET = 'CLIENT_SECRET';

const app = express();
app.use(cors());
app.use(express.json());

const FDF_TEMPLATE = path.join(__dirname, 'data.fdf');
const PDF_SOURCE   = path.join(__dirname, 'i-765-unlocked.pdf');
const TEMP_FDF     = path.join(__dirname, 'temp_filled.fdf');
const TEMP_PDF     = path.join(__dirname, 'temp_output.pdf');

app.post('/fill-i765', (req, res) => {
  const fields = {
    'Line1a_FamilyName[0]':         req.body.familyName     || '',
    'Line1b_GivenName[0]':          req.body.givenName      || '',
    'Line1c_MiddleName[0]':         req.body.middleName     || '',
    'Line19_DOB[0]':                req.body.dateOfBirth    || '',
    'Line18c_CountryOfBirth[0]':    req.body.countryOfBirth || '',
    'Line12b_SSN[0]':               req.body.ssn            || '',
    'Pt2Line7_StreetNumberName[0]': req.body.streetAddress  || '',
    'Pt2Line7_CityOrTown[0]':       req.body.city           || '',
    'Pt2Line7_State[0]':            req.body.state          || '',
    'Pt2Line7_ZipCode[0]':          req.body.zipCode        || '',
    'Line7_AlienNumber[0]':         req.body.alienNumber    || '',
  };

  try {
    // Step 1 — fill the FDF template in JS and write temp_filled.fdf
    let fdf = fs.readFileSync(FDF_TEMPLATE, 'latin1');

    for (const [key, value] of Object.entries(fields)) {
      if (!value) continue;
      const escapedKey   = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedValue = value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      const pattern      = new RegExp(`(/T \\(${escapedKey}\\)\\s*/V )\\([^)]*\\)`);
      fdf = fdf.replace(pattern, `$1(${escapedValue})`);
    }

    fs.writeFileSync(TEMP_FDF, fdf, 'latin1');

    // Step 2 — pdftk merges the filled FDF into the blank PDF
    execSync(`pdftk "${PDF_SOURCE}" fill_form "${TEMP_FDF}" output "${TEMP_PDF}"`);

    // Step 3 — stream the result back as a download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="I-765-LaMigra.pdf"');

    const stream = fs.createReadStream(TEMP_PDF);
    stream.pipe(res);
    stream.on('end',  () => cleanup());
    stream.on('error', (err) => { console.error('Stream error:', err); cleanup(); });
  } catch (err) {
    cleanup();
    console.error('Error filling PDF:', err.message);
    res.status(500).json({ error: 'Failed to fill PDF', details: err.message });
  }
});

function cleanup() {
  for (const f of [TEMP_FDF, TEMP_PDF]) {
    try { fs.unlinkSync(f); } catch {}
  }
}

app.listen(3001, () => {
  console.log('Server listening on http://localhost:3001');
});
