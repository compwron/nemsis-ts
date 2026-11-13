# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/). Versions below 1.0 may change the API in any release.

## [Unreleased]

## [0.0.1] - 2026-11-12

First release. Supports NEMSIS **3.5.0** (`3.5.0.251001CP6`) and **3.5.1**
(`3.5.1.251001CP2`), as separate subpath exports so applications load only the version they use.

### Added

- **Schema model and types:** the NEMSIS XSDs as a typed model (element tree, simple types, facets,
  enumerations with NEMSIS documentation) and generated TypeScript document types for the EMS, DEM and State
  datasets (`nemsis-ts/3.5.x`).
- **Parse:** `parse(xml)` returns a dataset-discriminated typed document. Values keep their exact text;
  `xsi:nil`, NV/PN, `CorrelationID` and other attributes are kept. Content the schema cannot place is reported
  as issues with path, line and column; malformed XML and any DOCTYPE throw `NemsisParseError`.
- **Serialize:** `serialize(document)` writes XML in `xs:sequence` order with exact values, and throws
  `NemsisSerializeError` (with a path) rather than dropping data.
- **XSD validation:** `nemsis-ts/validate` (libxml2 compiled to WASM; Node and browsers). Schema files are
  passed in; `loadSchemaFiles` in `nemsis-ts/node` reads them, and a build flag (`NEMSIS_BUNDLE_XSD=1`) can
  embed them in `nemsis-ts/3.5.x/xsd`.
- **Schematron validation:** `compileSchematron` (`nemsis-ts/node`) and `createSchematronValidator`
  (`nemsis-ts/schematron`) run the national business rules through SaxonJS and return typed SVRL issues.
  `saxon-js` and `xslt3` are optional peer dependencies (Saxonica's license; never bundled).
- **Defined lists:** `nemsis-ts/3.5.x/lists` with the six NEMSIS code lists and `list`, `listsForElement`,
  `lookup` and `find`.
- **Web services:** `nemsis-ts/ws`, a client for the NEMSIS V3 web services (SOAP 1.1 over HTTPS):
  `submitData`, `retrieveStatus`, `queryLimit`, and `waitForResult`/`submitAndWait` for servers that answer
  asynchronously. Typed results include the status code's meaning from the WSDL, element-level XML
  validation errors and the Schematron report (SVRL). HTTPS only (plain HTTP just for localhost), redirects
  refused, credentials never in errors. Uses `fetch`, so it runs in Node and browsers.
- Verified against NEMSIS's own artifacts: compliance cases, 110 sample files and 250 Schematron cases per
  version (see `docs/PLAN.md`). The artifacts are fetched at a pinned, hash-verified commit and never vendored.

### Known limitations

- XML comments and processing instructions are not preserved by `parse`.
- Defined lists are suggestions, not enumerations; the library offers lookups, not validation against them.
- Schematron runs on SaxonJS 2.7 with two small, documented workarounds (`src/schematron/patches.ts`).
- The web-service client is tested against fixtures and the WSDL's own schema, not yet against a live server
  (no test account); `schemaVersion` follows the guide's example (`3.5.0`), and state servers may differ.
- Not yet implemented: X12 837P/835, FHIR (IHE mPSC / US Core; draft design in `docs/FHIR-MAPPING.md`), NEMSIS 3.5.2.
- Pre-1.0: the API may change between releases.
