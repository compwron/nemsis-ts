# FHIR mapping (proposal, not agreed)

Status: **draft; scope decisions recorded 2026-11-12, mapping table still needs review. No code exists and none should be written until this is agreed.**
Written 2026-11-12.

## What the upstream guide actually gives us

Read 2026-11-12: IHE PCC "mobile Paramedicine Summary of Care (mPSC)", version `2.0.0-draft` (CI build,
generated 2025-10-30, FHIR R4 4.0.1, package `ihe.pcc.mpsc#2.0.0-draft`), page `NEMSIS-Mapping`. The IG says it
is "not an authorized publication" and changes regularly, so pin the version above when citing it.

Findings (from the fetched page text; I did not download the package):

- The mapping table lists about 390 NEMSIS elements, but only **27 have a FHIR path**. About 363 are blank,
  including every eRecord, eResponse, ePatient, eVitals and eMedications row.
- The 27 mapped rows are `dAgency.01-.04` (to `Organization`), `eCustomConfiguration.01-.09` (to `Observation`),
  and `eOutcome.*` (deferred to a "QORE Profile" that the page does not contain).
- No Notes column. The table has typos (duplicated eRecord rows, `ESoftware Name`, mistyped IDs).
- Profiles named by the IG: only two `Composition` profiles (Complete Report; Clinical Subset marked TODO).
  Document Bundle, Patient, Encounter, Observation, Procedure and MedicationAdministration profiles are not
  listed on the pages I read. The "NEMSIS to mPSC FHIR Mappings" appendix is marked TODO.

**Consequence:** there is no usable mapping to implement. A FHIR feature would be mostly our own design,
aligned to the mPSC document shape (a `Bundle` of type `document` led by a `Composition`) where it is defined.

## Proposed scope (for discussion)

A two-way mapping, lossy in places: `NEMSIS PCR -> FHIR R4 Bundle (document)`, new entry `nemsis-ts/fhir`.
Owner wants both directions (see decisions below). FHIR to NEMSIS is harder: NEMSIS has many mandatory elements FHIR data will not carry.

Proposed section-level mapping (my proposal; none of it is from the IG except the rows marked IG):

| NEMSIS section                      | FHIR target                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| dAgency (IG: .01-.04)               | `Organization` (identifier, name, address)                                         |
| eRecord, eResponse                  | `Composition` metadata, `Encounter` (class EMER), `Organization`                   |
| eDispatch, eTimes                   | `Encounter.period`, `Encounter.extension` for unit times (or `Provenance`)         |
| ePatient                            | `Patient`                                                                          |
| eCrew / ePayment (insurance)        | `Practitioner`/`PractitionerRole`; `Coverage` (relevant to the later billing work) |
| eSituation                          | `Condition`, `Observation`, `Encounter.reasonCode`                                 |
| eHistory                            | `AllergyIntolerance`, `Condition`, `Immunization`                                  |
| eVitals                             | `Observation` (vital-signs profile, LOINC)                                         |
| eProcedures                         | `Procedure`                                                                        |
| eMedications                        | `MedicationAdministration`                                                         |
| eInjury, eArrest, eExam, eNarrative | `Observation`, `Condition`, `Composition.section` text                             |
| eDisposition                        | `Encounter.hospitalization`, destination `Location`                                |
| eOutcome (IG: deferred to QORE)     | out of scope until the QORE profile is available                                   |
| eCustomConfiguration (IG)           | `Observation` per the IG; needs a closer look                                      |

## Owner decisions (2026-11-12)

1. **Both directions** (NEMSIS to FHIR and FHIR to NEMSIS). The reverse direction needs a policy for NEMSIS
   mandatory elements FHIR data lacks: emit NEMSIS null flavors (`NV`/`PN`, e.g. "Not Recorded") and report
   what was defaulted. To be designed in the mapping, not assumed.
2. **Terminology:** research, see below.
3. **Realm:** both international mPSC `Composition` and US Core profiles.
4. **Validation:** owner unsure; pros and cons below.
5. **IHE contact:** not needed (the mapping is being worked on, slowly). Do not ask.
6. Priority versus X12: unchanged; X12 is blocked on the guides, so FHIR goes first.

## Q2 research: code systems

Searched 2026-11-12 for a published NEMSIS FHIR `CodeSystem`/canonical URL: **none found** (not verified
exhaustively; the search tool is shallow). What our own pinned defined lists reference (counted in
`src/generated`): ICD-10-CM (most common), SNOMED CT, RxNorm, GNIS (place codes); others are NEMSIS-only lists.

Proposal:
- Standard-backed lists map to the standard FHIR system URIs: ICD-10-CM `http://hl7.org/fhir/sid/icd-10-cm`,
  SNOMED CT `http://snomed.info/sct`, RxNorm `http://www.nlm.nih.gov/research/umls/rxnorm`, LOINC
  `http://loinc.org`. (These are well-known HL7 URIs from memory; confirm each against the FHIR terminology
  registry before coding.) GNIS has no HL7 URI I know of.
- NEMSIS-only lists need a URI. Options: (a) `https://nemsis.org/...` per list: it is NEMSIS's namespace and is not
  ours to mint, so only with their blessing; (b) a URI under our own control, which is wrong if we do not
  own a domain; (c) `urn:oid:` / `urn:` scheme: stable and ownerless but opaque. **Recommendation:** make the
  base URI a configurable option, default to a clearly provisional `urn:nemsis-ts:...`-style value, and ask
  NEMSIS TAC (we are already preparing questions for them) whether they intend a canonical URL. Do not
  squat on `nemsis.org`.
- Round-trip needs the code system for each element recorded in the mapping table, generated from the defined
  lists, so the reverse direction can map `Coding` back to the right element.

## Q4: how to validate generated FHIR

| Option                                         | Pros                                                                           | Cons                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HL7 Java validator (`validator_cli.jar`) in CI | Authoritative; checks profiles, invariants, terminology; what implementers use | Needs Java and downloads the jar + IG packages in CI (network, slow, supply-chain surface); not usable in browsers; our "no heavy runtime deps" stance |
| Pure-JS validators (npm)                       | No Java, fast                                                                  | Search found small/young packages with unclear R4 profile coverage (unverified); weaker than the real thing                                            |
| Hand-written structural checks only            | Zero deps, fast, runs in the browser, deterministic                            | Only catches what we think to check; no profile or terminology validation; risk of passing in tests but failing real validators                        |
| FHIR JSON Schema from the spec                 | Cheap structural check, no Java                                                | Does not cover profiles, invariants or terminology                                                                                                     |

**Recommendation:** hybrid. Library ships with no validator dependency. Tests use hand-written structural checks
plus the official FHIR JSON Schema on every run, and a separate, optional (non-gating at first) CI job or
local script runs the HL7 Java validator against golden outputs built from NEMSIS sample files. Promote the
Java job to gating once it is stable. This matches how we treat Saxon (optional, never bundled).

## Not verified

- I did not read the individual `Composition` StructureDefinition, the package, or the FHIR resource
  definitions beyond memory. The table above is a proposal and must be checked against the IG package and R4
  before any code.
