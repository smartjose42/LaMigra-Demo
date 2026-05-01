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

// Python one-liner that replaces /V (...) for every named field in the FDF.
// All dynamic data is passed via environment variables (D, I, O) to avoid
// any shell-injection risk. Python uses double quotes throughout so the
// shell command can be safely wrapped in single quotes.
const PYTHON_ONELINER = [
  'import re,json,os',
  'd=json.loads(os.environ["D"])',
  't=open(os.environ["I"],encoding="latin-1").read()',
  '[t:=re.sub("(/T \\\\("+re.escape(k)+"\\\\)\\\\s*/V )\\\\([^)]*\\\\)",lambda m,v=v.replace("\\\\","\\\\\\\\").replace("(","\\\\(").replace(")","\\\\)"):m.group(1)+"("+v+")",t) for k,v in d.items() if v]',
  'open(os.environ["O"],"w",encoding="latin-1").write(t)',
].join(';');

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
    // Step 1 — Python fills the FDF template and writes temp_filled.fdf
    execSync(`python3 -c '${PYTHON_ONELINER}'`, {
      env: { ...process.env, D: JSON.stringify(fields), I: FDF_TEMPLATE, O: TEMP_FDF },
    });

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
