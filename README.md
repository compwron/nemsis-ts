# nemsis-ts

> **Status: pre-alpha / statement of intent.** There is no code here yet. This README describes
> what we plan to build and why.

A TypeScript library for **reading, writing and validating EMS data**, starting with
[NEMSIS v3.5](https://nemsis.org/v3-5-revision) and extending to the formats that EMS data has to
reach: **X12** (billing), **FHIR** (hospital handoff) and, where needed, **HL7 v2 / CDA**.

## Why

As of November 2026 there is no maintained, general-purpose TypeScript library for NEMSIS.

- The only npm package that mentions NEMSIS (`@traumatrial/match`) is a trauma-trial eligibility
  matcher with a narrow ePCR adapter, and its source repo no longer resolves.
- The most complete open-source NEMSIS v3.5 handling lives inside applications, not libraries:
  [peak-server](https://github.com/peakresponse/peak-server) (AGPL-3.0) and
  [emberstone](https://github.com/rodneygauna/emberstone) (GPL-3.0).
- [peak-ios-nemsiskit](https://github.com/peakresponse/peak-ios-nemsiskit) is Swift only.

Everyone ends up writing the same pieces again: types generated from the XSDs, XML parsing and building,
XSD and Schematron validation, and mapping ePCR data into claims or clinical exchange formats. We want
those pieces in one typed, tested, permissively licensed package.

## Goals

### 1. NEMSIS v3.5 — core (first priority)

Covering all three data sets from the
[v3.5 data dictionary](https://nemsis.org/media/nemsis_v3/release-3.5.0/DataDictionary/PDFHTML/EMSDEMSTATE/index.html):

| Data set                   | What it holds                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EMS** (`EMSDataSet`)     | One ePCR per patient contact: `eRecord`, `eTimes`, `eSituation`, `eVitals`, `eMedications`, `eProcedures`, `eDisposition`, `ePayment`, `eOutcome`, … |
| **DEM** (`DEMDataSet`)     | Agency setup: units, personnel, facilities, configuration                                                                                            |
| **State** (`StateDataSet`) | State-level rules and custom value lists                                                                                                             |

Planned features:

- **Types** generated from the official XSDs (`EMSDataSet_v3.xsd`, `DEMDataSet_v3.xsd`,
  `StateDataSet_v3.xsd`), with element IDs (e.g. `eTimes.03`) and human-readable names.
- **Parse** NEMSIS XML into typed objects, keeping `NV` (Not Values), `PN` (Pertinent Negatives)
  and `xsi:nil` intact.
- **Build/serialize** typed objects back to schema-valid XML (round-trip safe).
- **Validate** against the XSDs, and against the national Schematron rules through an XSLT step.
- **Code sets**: NEMSIS value lists as typed enums/lookups.
- Runs in **Node and the browser** (no native dependencies required for the core).

### 2. X12 EDI — billing (second priority)

EMS claims don't travel over NEMSIS, HL7 or FHIR. They use X12. For EMS revenue-cycle work we plan to support:

- **837P** professional claims: build from a NEMSIS ePCR (`ePayment`, `eTimes`, `eDisposition`
  incl. transport mileage, `eSituation` / `eProcedures`, `eCrew`)
- **835** remittance advice: parse
- **270/271** eligibility and **276/277** claim status: parse/build

### 3. FHIR — clinical handoff (later)

There is no US HL7 FHIR EMS implementation guide built on NEMSIS. The active FHIR work for US EMS
comes from IHE, and we plan to track it:

- **IHE mPSC** (mobile Paramedicine Summary of Care, formerly PCS): EMS → ED handoff, FHIR R4.
  Still a draft (`ihe.pcc.mpsc#2.0.0-draft`), and its
  [NEMSIS mapping](https://build.fhir.org/ig/IHE/PCC.PCS/NEMSIS-Mapping.html) is incomplete.
  We'd like to provide (and upstream) a fuller NEMSIS → mPSC mapping.
- **IHE QORE**: hospital → EMS outcome feedback, which maps back into `eOutcome`.
- **IHE RIPT**: scheduled interfacility transports.

### 4. HL7 v2 / CDA (as needed)

Only where a hospital integration requires it, e.g. the HL7 CDA EMS Patient Care Report IG (2011),
which lines up with NEMSIS v3.

## Non-goals

- Not an ePCR application, billing system or state repository.
- Not a replacement for official NEMSIS compliance testing.
- Not a general-purpose FHIR or X12 toolkit. We cover the EMS-relevant subset.

## Planned approach

See **[docs/PLAN.md](docs/PLAN.md)** for the full build plan (CI, TDD, milestones).

- The definitive definitions are the XSDs, national Schematron and WSDL from NEMSIS TAC's git repo
  (`https://git.nemsis.org/scm/nep/nemsis_public.git`), pinned to release tags `3.5.0.251001CP6` and `3.5.1.251001CP2`.
  They're fetched and checksum-verified at build time, not committed.
- Generate types from those XSDs with our own generator (spiking `cxsd` first), then layer
  hand-written ergonomics on top.
- Parse and build XML with `fast-xml-parser` / `xmlbuilder2`.
- Validate XSDs with `xmllint-wasm` (or `libxmljs2` on Node). Run Schematron as a separate XSLT step.
- **Clean room:** we build only from official NEMSIS artifacts and public standards. We don't read or
  copy source from other implementations, including the GPL/AGPL projects above.
- Test-first, driven by official NEMSIS compliance test cases, sample data and expected Schematron output.

## Usage (early, API may change)

```ts
import { readFileSync } from "node:fs";
import type { EMS } from "nemsis-ts/3.5.1"; // typed documents: EMS.PatientCareReport, codes.*, …
import { schema } from "nemsis-ts/3.5.1"; // schema model: element tree, simple types, NEMSIS docs
import { createXsdValidator } from "nemsis-ts/validate";
import { loadSchemaFiles } from "nemsis-ts/node";

// NEMSIS XSDs are not bundled: point at a NEMSIS release's XSDs/NEMSIS_XSDs directory.
const validator = createXsdValidator(loadSchemaFiles("NEMSIS_XSDs"));
const result = await validator.validate(readFileSync("ems.xml", "utf8"));
// { valid: false, dataset: "EMSDataSet", errors: [{ line: 121, element: "eSituation", message: "…" }] }
```

## Roadmap (tentative)

- [x] Project scaffolding (TypeScript, tests, CI)
- [x] XSD → schema model + TypeScript document types for EMS / DEM / State (3.5.0, 3.5.1)
- [ ] NEMSIS XML parse + serialize with round-trip tests
- [x] XSD validation
- [ ] Schematron validation
- [ ] NEMSIS value lists / code sets
- [ ] X12 837P generation from an EMS record
- [ ] X12 835 parsing
- [ ] NEMSIS → FHIR (IHE mPSC) mapping

## Contributing

Ideas, use cases and pointers to prior art are welcome. Please open an issue.

## License

[Apache-2.0](LICENSE).

## References

- NEMSIS v3.5: https://nemsis.org/v3-5-revision
- NEMSIS v3.5 resources (XSD, Schematron): https://nemsis.org/v3-5-revision/v3-5-resources/
- v3.5.1 change log: https://nemsis.org/wp-content/uploads/2025/01/v3.5.1.250115-ChangeLog.pdf
- IHE EMS overview: https://build.fhir.org/ig/IHE/EMS-Overall/pcf.html
- IHE mPSC: https://build.fhir.org/ig/IHE/PCC.PCS/
- IHE QORE: https://wiki.ihe.net/index.php/Quality_Outcome_Reporting_for_EMS
- IHE PCC EMS profiles: https://profiles.ihe.net/PCC/ems.html
- HL7 CDA EMS Run Report (2011): https://wiki.hl7.org/w/images/wiki.hl7.org/6/67/EMSRunReportCDA_Dec2011.pdf
