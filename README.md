# nemsis-ts

> **Status: pre-release, not yet published to npm.** The NEMSIS v3.5 core works: typed documents,
> parse and serialize, XSD and Schematron validation, defined lists and a web-service client, for both
> 3.5.0 and 3.5.1. X12 billing and FHIR are planned, not built. The API may still change.
>
> This is an independent project. It is not affiliated with, endorsed by or sponsored by NEMSIS, the
> NEMSIS Technical Assistance Center, NHTSA or Saxonica.

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

### 1. NEMSIS v3.5 — core (working)

Covering all three data sets from the
[v3.5 data dictionary](https://nemsis.org/media/nemsis_v3/release-3.5.0/DataDictionary/PDFHTML/EMSDEMSTATE/index.html):

| Data set                   | What it holds                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EMS** (`EMSDataSet`)     | One ePCR per patient contact: `eRecord`, `eTimes`, `eSituation`, `eVitals`, `eMedications`, `eProcedures`, `eDisposition`, `ePayment`, `eOutcome`, … |
| **DEM** (`DEMDataSet`)     | Agency setup: units, personnel, facilities, configuration                                                                                            |
| **State** (`StateDataSet`) | State-level rules and custom value lists                                                                                                             |

Features:

- **Types** generated from the official XSDs (`EMSDataSet_v3.xsd`, `DEMDataSet_v3.xsd`,
  `StateDataSet_v3.xsd`) for NEMSIS 3.5.0 and 3.5.1, with element IDs (e.g. `eTimes.03`) and
  human-readable names. A schema model with the NEMSIS documentation text is available at runtime.
- **Parse** NEMSIS XML into typed objects, keeping `NV` (Not Values), `PN` (Pertinent Negatives)
  and `xsi:nil` intact.
- **Build/serialize** typed objects back to schema-valid XML (round-trip safe).
- **Validate** against the XSDs (`nemsis-ts/validate`, libxml2 compiled to WebAssembly), and against
  the national Schematron rules (`nemsis-ts/schematron`, using SaxonJS as an optional peer dependency).
- **Code sets**: NEMSIS value lists as typed enums, plus the suggested defined lists
  (`nemsis-ts/3.5.x/lists`).
- **Web services**: a client for the NEMSIS SOAP web services (`nemsis-ts/ws`): SubmitData, RetrieveStatus,
  QueryLimit. It is tested against the WSDL and fixtures, **not yet against a live server**.
- Runs in **Node and the browser** (no native dependencies; file-system helpers live in `nemsis-ts/node`).

### 2. X12 EDI — billing (planned, not started)

EMS claims don't travel over NEMSIS, HL7 or FHIR. They use X12. For EMS revenue-cycle work we plan to support:

- **837P** professional claims: build from a NEMSIS ePCR (`ePayment`, `eTimes`, `eDisposition`
  incl. transport mileage, `eSituation` / `eProcedures`, `eCrew`)
- **835** remittance advice: parse
- **270/271** eligibility and **276/277** claim status: parse/build

### 3. FHIR — clinical handoff (planned, design in progress)

There is no US HL7 FHIR EMS implementation guide built on NEMSIS. The active FHIR work for US EMS
comes from IHE, and we plan to track it:

- **IHE mPSC** (mobile Paramedicine Summary of Care, formerly PCS): EMS → ED handoff, FHIR R4.
  Still a draft (`ihe.pcc.mpsc#2.0.0-draft`), and its
  [NEMSIS mapping](https://build.fhir.org/ig/IHE/PCC.PCS/NEMSIS-Mapping.html) is incomplete.
  We'd like to provide (and upstream) a fuller NEMSIS → mPSC mapping. A draft mapping and the open
  design questions are in [docs/FHIR-MAPPING.md](docs/FHIR-MAPPING.md); no FHIR code exists yet.
- **IHE QORE**: hospital → EMS outcome feedback, which maps back into `eOutcome`.
- **IHE RIPT**: scheduled interfacility transports.

### 4. HL7 v2 / CDA (as needed)

Only where a hospital integration requires it, e.g. the HL7 CDA EMS Patient Care Report IG (2011),
which lines up with NEMSIS v3.

## Non-goals

- Not an ePCR application, billing system or state repository.
- Not a replacement for official NEMSIS compliance testing.
- Not a general-purpose FHIR or X12 toolkit. We cover the EMS-relevant subset.

## Approach

See **[docs/PLAN.md](docs/PLAN.md)** for the build plan, decisions and milestones.

- The definitive definitions are the XSDs, national Schematron and WSDL from NEMSIS TAC's git repo
  (`https://git.nemsis.org/scm/nep/nemsis_public.git`), pinned to release tags `3.5.0.251001CP6` and `3.5.1.251001CP2`.
  They're fetched and checksum-verified at build time, not committed.
- Types and the schema model are generated from those XSDs by our own generator (`pnpm codegen`); the
  generated files are committed and CI checks they are up to date.
- XML is parsed with `saxes` and serialized by our own code; round trips are tested on the 125 official
  sample files per version.
- XSD validation uses `xmllint-wasm`. Schematron runs as a separate XSLT step through SaxonJS
  (`saxon-js` and `xslt3`, optional peers under Saxonica's own license; they are not bundled).
- **Clean room:** we build only from official NEMSIS artifacts and public standards. We don't read or
  copy source from other implementations, including the GPL/AGPL projects above.
- Test-first, driven by official NEMSIS sample data and expected Schematron output (about 2,850 tests).

## Usage (early, API may change)

```ts
import { readFileSync } from "node:fs";
import type { EMS } from "nemsis-ts/3.5.1"; // typed documents: EMS.PatientCareReport, codes.*, …
import { parse, schema, serialize } from "nemsis-ts/3.5.1"; // parse/serialize; schema model (element tree, simple types, NEMSIS docs)
import { createXsdValidator } from "nemsis-ts/validate";
import { loadSchemaFiles } from "nemsis-ts/node";

const xml = readFileSync("ems.xml", "utf8");
const parsed = parse(xml); // throws NemsisParseError on malformed XML
if (parsed.dataset === "EMSDataSet") {
	const pcr: EMS.PatientCareReport | undefined =
		parsed.document.Header[0]?.PatientCareReport[0];
}
// parsed.issues: content the schema could not place, e.g. { code: "missing-element", path: "…/ePatient.25", line: 40 }
const out = serialize(parsed); // XML again, elements in schema order; parse(out) gives back the same document

// NEMSIS XSDs are not bundled: point at a NEMSIS release's XSDs/NEMSIS_XSDs directory.
const validator = createXsdValidator(loadSchemaFiles("NEMSIS_XSDs"));
const result = await validator.validate(xml);
// { valid: false, dataset: "EMSDataSet", errors: [{ line: 121, element: "eSituation", message: "…" }] }

// Defined lists (suggested code sets: ICD-10 symptoms, RxNorm medications, ...), kept in their own entry.
import { definedLists } from "nemsis-ts/3.5.1/lists";
definedLists.find("eMedications.03", "161", "9924003")?.code.suggestedLabel; // "Acetaminophen (Tylenol)"
definedLists.listsForElement("eSituation.09").map((l) => l.name); // ["Symptom"]

// Schematron (business rules): optional peers `saxon-js` + `xslt3` (Saxonica license, not bundled).
import { compileSchematron } from "nemsis-ts/node";
import { createSchematronValidator } from "nemsis-ts/schematron";

// Slow (~30 s): compile once from a NEMSIS release checkout and cache the JSON.
const sef = await compileSchematron({
	schematron: "Schematron/rules/EMSDataSet.sch",
	skeletonDir:
		"Schematron/DevelopmentKit/Schematron/utilities/iso-schematron-xslt2",
});
const rules = createSchematronValidator(sef);
const report = await rules.validate(xml);
// { valid: false, issues: [{ id: "nemSch_e002", severity: "error", location: "/*:EMSDataSet…", text: "…" }], svrl }

// Submit to a state repository (or NEMSIS's validator) over the NEMSIS web services (SOAP over HTTPS).
import { createNemsisWsClient } from "nemsis-ts/ws";

const ws = createNemsisWsClient({
	endpoint: "https://validator.nemsis.org/",
	username: "emonster",
	password: "…",
	organization: "ElmoAgency",
});
const outcome = await ws.submitAndWait({ xml, schemaVersion: "3.5.1" }); // polls while the server is busy
outcome.status.kind; // "success" | "partial" | "pending" | "error"
outcome.status.description; // "Successful import of a file, with [WARNING] level Schematron rule violation reported"
outcome.report?.xmlValidation?.errors; // element-level XSD errors; report.schematronReports holds SVRL
```

Not yet published to npm. See the [changelog](CHANGELOG.md) and the [release checklist](docs/RELEASING.md).

## Roadmap (tentative)

- [x] Project scaffolding (TypeScript, tests, CI)
- [x] XSD → schema model + TypeScript document types for EMS / DEM / State (3.5.0, 3.5.1)
- [x] NEMSIS XML parse into typed documents
- [x] NEMSIS XML serialize with round-trip tests
- [x] XSD validation
- [x] Schematron validation
- [x] NEMSIS defined lists / code sets
- [x] NEMSIS web-service (SOAP) client: SubmitData, RetrieveStatus, QueryLimit
- [ ] X12 837P generation from an EMS record
- [ ] X12 835 parsing
- [ ] NEMSIS ⇄ FHIR (IHE mPSC / US Core) mapping (draft: [docs/FHIR-MAPPING.md](docs/FHIR-MAPPING.md))

## Contributing

Ideas, use cases and pointers to prior art are welcome. Please open an issue. Contributions must be clean room: do not
submit code derived from GPL/AGPL implementations.

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
