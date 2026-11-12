# FHIR mapping (proposal, not agreed)

Status: **draft for owner review. No code exists and none should be written until this is agreed.**
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

A one-way, lossy-by-design export `NEMSIS PCR -> FHIR R4 Bundle (document)`, new entry `nemsis-ts/fhir`.
Reverse direction (FHIR to NEMSIS) is out of scope: NEMSIS has many mandatory elements FHIR data will not carry.

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

## Open questions for the owner

1. Is a one-way export enough, or is FHIR-to-NEMSIS also wanted?
2. Which terminologies? NEMSIS defined lists use ICD-10, SNOMED, RxNorm, LOINC in places, and NEMSIS-specific
   codes elsewhere; the latter need a stable `CodeSystem` URL (ours? NEMSIS's? none is published to my knowledge).
3. Which realm: international mPSC `Composition` only, or also US Core profiles?
4. Validation: depend on the HL7 validator (Java, out of band) for our tests, or hand-written structural checks only?
5. Should we ask IHE PCC whether the NEMSIS mapping is being actively worked on, to avoid diverging from it?
   (This sends nothing project-specific; it needs the owner's go-ahead anyway.)
6. Priority versus the X12 work, which is blocked on the guides.

## Not verified

- I did not read the individual `Composition` StructureDefinition, the package, or the FHIR resource
  definitions beyond memory. The table above is a proposal and must be checked against the IG package and R4
  before any code.
