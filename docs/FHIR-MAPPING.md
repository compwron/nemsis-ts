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

## Per-element review, first pass (ePatient, eVitals, eMedications)

Element names, types, cardinality and usage come from our generated NEMSIS 3.5.1 model. The FHIR targets are my
proposal from memory of R4 and US Core; **LOINC codes and US Core details marked "verify" are unchecked** and
must be confirmed against the packages before coding. `n` = a NEMSIS element is nillable: `NV` (not value) or
`PN` (pertinent negative) attributes map to FHIR `dataAbsentReason` (or a missing-field extension) and back.

### ePatient to `Patient` (US Core Patient is the superset target)

| Element                                     | NEMSIS      | FHIR target                                                    | Gap / note                                                                                                                                              |
| ------------------------------------------- | ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| .01 EMS Patient ID                          | O 0..1      | `identifier` (system provisional)                              |                                                                                                                                                         |
| .02/.03/.04/.23 last, first, middle, suffix | Rec/Rec/O/O | `name.family`, `name.given[0]`, `name.given[1]`, `name.suffix` | Middle may be an initial only.                                                                                                                          |
| .05 street                                  | O           | `address.line`                                                 |                                                                                                                                                         |
| .06 city (GNIS code)                        | O           | `address.city`                                                 | NEMSIS gives a code, FHIR wants a name: needs a GNIS lookup table we do not have; otherwise carry the code in an extension and leave `city` empty.      |
| .07 county, .08 state (ANSI codes)          | R 1..1      | `address.district`, `address.state`                            | Codes are FIPS numeric; FHIR/US Core expect names or USPS letters. Needs a FIPS table (bundleable, small).                                              |
| .09 ZIP                                     | R           | `address.postalCode`                                           |                                                                                                                                                         |
| .10 country                                 | O           | `address.country`                                              |                                                                                                                                                         |
| .11 census tract                            | O           | extension (no standard one known; verify)                      |                                                                                                                                                         |
| .12 SSN                                     | O           | `identifier` (system `http://hl7.org/fhir/sid/us-ssn`, verify) | Sensitive: export should be opt-in.                                                                                                                     |
| .13 gender (deprecated)                     | R           | `gender`                                                       | Deprecated in 3.5; map but prefer .25.                                                                                                                  |
| .25 Sex                                     | R 1..1      | US Core `birthsex` extension (F/M/UNK)                         | Our own samples omit .25 (PLAN §9). NEMSIS values beyond F/M/UNK need checking against the list.                                                        |
| .14 Race (1..*)                             | R           | US Core `race` extension                                       | NEMSIS race codes are not OMB/CDC codes; needs a crosswalk. Check whether the list includes Hispanic/Latino (FHIR `ethnicity` is a separate extension). |
| .15/.16 Age + units                         | R/R         | no direct field                                                | Only derivable when .17 exists. Otherwise an `Observation` (age) or an extension. Reverse direction: compute from `birthDate` and the encounter date.   |
| .17 DOB                                     | Rec         | `birthDate`                                                    |                                                                                                                                                         |
| .18 phone (0..*), .19 email                 | O           | `telecom` (system phone/email)                                 | Phone type (home, mobile) lives in attributes.                                                                                                          |
| .20/.21 driver license state/number         | O           | `identifier` (type DL)                                         | Sensitive; opt-in.                                                                                                                                      |
| .22 alternate home residence                | Rec         | extension or social-history `Observation`                      | Values include homeless, nursing home: a SNOMED mapping is a guess to verify.                                                                           |
| .24 preferred languages (0..*)              | O           | `communication.language`, `preferred`                          | Needs NEMSIS language code to BCP-47 crosswalk.                                                                                                         |

### eVitals to `Observation` (US Core Vital Signs profiles where they exist)

`eVitals.VitalGroup` repeats; each group shares `eVitals.01` (time). Proposed: one `Observation` per measured
value, all with the same `effectiveDateTime`, plus a blood-pressure panel with systolic/diastolic components
(LOINC 85354-9, 8480-6, 8462-4: from memory, verify). Group membership (`hasMember` on a panel) keeps the group
reversible.

| Element                                             | FHIR target                                  | Note                                                                                               |
| --------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| .01 time                                            | `effectiveDateTime`                          |                                                                                                    |
| .02 obtained prior to this unit's care              | extension on each Observation                | Not clinical, but needed for round trip.                                                           |
| .06/.07/.09 SBP, DBP, MAP                           | BP panel components; MAP separate            | .08 method to `method`                                                                             |
| .10/.11 heart rate, method                          | Heart-rate observation, `method`             |                                                                                                    |
| .12 pulse ox                                        | SpO2 observation                             |                                                                                                    |
| .13 pulse rhythm                                    | observation, coded                           | LOINC to look up                                                                                   |
| .14/.15 resp rate, effort                           | observations                                 |                                                                                                    |
| .16 ETCO2, .17 CO                                   | observations                                 | LOINC to look up; units differ                                                                     |
| .18 blood glucose                                   | observation (mg/dL)                          |                                                                                                    |
| .19-.23 GCS eye/verbal/motor/qualifier/total        | GCS observations (total with components)     | .22 qualifier (1..*) has no home: component or note. NEMSIS total (.23) may disagree with the sum. |
| .24/.25 temperature, method                         | temperature observation, `method`            | Unit (F vs C) must be preserved.                                                                   |
| .26 AVPU                                            | observation, coded                           |                                                                                                    |
| .27/.28 pain score, scale type                      | observation, scale type in code or component |                                                                                                    |
| .29/.30/.34 stroke result, type, score              | observation(s)                               | Scale types differ (e.g. cincinnati); one code per scale.                                          |
| .31 reperfusion checklist, .32 APGAR, .33 RTS       | observations                                 | APGAR has no minute in NEMSIS.                                                                     |
| .03/.04/.05 rhythm, ECG type, interpretation method | ECG-rhythm observation with components       | Repeating coded values.                                                                            |

Almost all of eVitals is `Required` and nillable, so exports will be full of `dataAbsentReason`; FHIR to NEMSIS
must fill missing required values with the correct `NV`/`PN` code.

### eMedications to `MedicationAdministration` (R4)

| Element                                             | FHIR target                                             | Note                                                                |
| --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| .01 time                                            | `effectiveDateTime`                                     |                                                                     |
| .03 medication (RxNorm)                             | `medicationCodeableConcept`                             |                                                                     |
| .04 route                                           | `dosage.route`                                          | NEMSIS route list needs a code-system decision (see Q2).            |
| .05/.06 dose + units                                | `dosage.dose` (Quantity)                                | Units list is not UCUM (drops, puffs, etc.): a crosswalk is needed. |
| .07 response                                        | `Observation` referencing the administration, or `note` |                                                                     |
| .08 complication (1..*)                             | `AdverseEvent` (R4) or `note`                           |                                                                     |
| .09 crew ID, .10 role                               | `performer.actor`, `performer.function`                 | .09 is an agency-local ID, so a `Practitioner` with identifier.     |
| .11/.12 authorization, authorizing physician        | `request` / extension; `Practitioner`                   |                                                                     |
| .02/.13 prior to this unit's care / by another unit | see open question A                                     |                                                                     |

### Cross-cutting findings

- NEMSIS 1..1 "Required" elements are mostly nillable, so a minimal valid NEMSIS record can carry almost no
  clinical data. The FHIR export must not drop `NV`/`PN` information.
- Several lists need crosswalks we would have to build and maintain: FIPS to names/USPS, GNIS to names, NEMSIS
  race to OMB, languages to BCP-47, dose units to UCUM. These are the real cost of the feature.
- US Core versions move: pin the one we target (verify which R4-based version is current).

### Open questions from this pass

A. Medications given before arrival or by another unit (`.02`, `.13`): `MedicationStatement` rather than
`MedicationAdministration`? Proposal: administration when given by this unit, statement otherwise.
B. Crosswalk tables: bundle small ones (FIPS, race, UCUM units) in the package, or load them like the NEMSIS
artifacts? Proposal: generate small ones into the package; the large GNIS name table stays out and city is a
code extension unless the caller supplies a lookup.
C. Sensitive identifiers (SSN, driver license): omit by default, include only with an explicit option?
D. Per-value `Observation` or panels for vitals? Proposal as above: individual observations plus BP panel plus
a group panel for reversibility.

## Not verified

- I did not read the individual `Composition` StructureDefinition, the package, or the FHIR resource
  definitions beyond memory. The table above is a proposal and must be checked against the IG package and R4
  before any code.
