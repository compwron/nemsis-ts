# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/) once released (nothing is published yet).

## [Unreleased]

First public release candidate (`0.1.0`). Supports NEMSIS **3.5.0** (`3.5.0.251001CP6`) and **3.5.1**
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
- Verified against NEMSIS's own artifacts: compliance cases, 110 sample files and 250 Schematron cases per
  version (see `docs/PLAN.md`). The artifacts are fetched at a pinned, hash-verified commit and never vendored.

### Known limitations

- XML comments and processing instructions are not preserved by `parse`.
- Defined lists are suggestions, not enumerations; the library offers lookups, not validation against them.
- Schematron runs on SaxonJS 2.7 with two small, documented workarounds (`src/schematron/patches.ts`).
- Not yet implemented: X12 837P/835, FHIR (IHE mPSC), the NEMSIS WSDL client, NEMSIS 3.5.2.
