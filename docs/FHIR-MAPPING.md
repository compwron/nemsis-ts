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

## Decisions on the first pass (owner, 2026-11-12, provisional)

Questions A to D above are provisionally approved as proposed: `MedicationStatement` for medications given before
arrival or by another unit; small crosswalks generated into the package (GNIS names stay out, city carried as a
code extension unless the caller supplies a lookup); SSN and driver's license omitted unless an explicit option
is set; vitals as individual Observations plus a blood-pressure panel and a group panel.

## Per-element review, second pass (encounter shell, clinical context, payment)

Same caveats as the first pass: names, types, cardinality and usage are from the generated 3.5.1 model; FHIR
targets are from memory and need checking. Code lists named here (impressions, procedures) are SNOMED or ICD-10
in NEMSIS, so they map to standard FHIR systems (see Q2).

### Encounter shell: eRecord, eResponse, eDispatch, eTimes, eCrew to `Composition`, `Encounter`, `Organization`, `Practitioner`, `Location`

| Element(s)                                                   | FHIR target                                                                                                                     | Note                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| eRecord.01 PCR number                                        | `Composition.identifier` and `Bundle.identifier`                                                                                | The natural document id.                                                                                         |
| eRecord.02-.04 software creator, name, version               | `Composition.author` as a `Device`, or `Provenance.agent`                                                                       |                                                                                                                  |
| eResponse.01/.02 agency number, name                         | `Organization.identifier`, `name` (same resource as `dAgency`)                                                                  | IG maps dAgency to `Organization`.                                                                               |
| eResponse.03/.04 incident, response number                   | `Encounter.identifier` (two systems)                                                                                            |                                                                                                                  |
| eResponse.05 service type, .06 standby purpose               | `Encounter.serviceType`, `reasonCode`                                                                                           |                                                                                                                  |
| eResponse.07 unit capability, .13/.14 unit number, call sign | `Device` or `Location` (ambulance unit) via `Encounter.participant`/`location`                                                  | R4 has no vehicle resource; `Device` is the usual stand-in.                                                      |
| eResponse.08-.12 delay types (1..*)                          | extension on `Encounter`                                                                                                        | No FHIR home.                                                                                                    |
| eResponse.16-.18 dispatch location, GPS, USNG                | `Location` (`position` for GPS)                                                                                                 | USNG has no field; extension.                                                                                    |
| eResponse.19-.22 odometer readings                           | extension on `Encounter`                                                                                                        | Also relevant to billing mileage.                                                                                |
| eResponse.23/.24 response mode                               | extension                                                                                                                       |                                                                                                                  |
| eDispatch.01-.06                                             | `Encounter.reasonCode` (.01); extensions for EMD, determinant, CAD ids; `Encounter.priority` (.05)                              | Determinant codes are proprietary systems.                                                                       |
| eCrew.01-.03                                                 | `Practitioner` + `PractitionerRole` in `Encounter.participant` (type from .03, qualification from .02)                          | .01 is an agency-local id, as in eMedications.09.                                                                |
| eTimes.01-.17 (17 timestamps)                                | `Encounter.period` (unit en route to back in service) plus a set of extensions, or one `Provenance`/`Observation` per milestone | Proposal: a single repeating `Encounter` extension `{milestone code, dateTime}`, keeping all 17 and their order. |

### Clinical context: eSituation, eHistory to `Condition`, `Observation`, `AllergyIntolerance`, `Immunization`, `MedicationStatement`

| Element(s)                                                            | FHIR target                                                                           | Note                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| eSituation.01 symptom onset                                           | `Condition.onsetDateTime` (on the primary complaint condition)                        |                                                            |
| eSituation.02/.14 possible injury, work related                       | `Encounter.reasonCode` flag / `Observation`                                           |                                                            |
| eSituation.03-.06 complaint, type, duration, units                    | `Condition` (`code`/text, `onset` or `abatement` duration, `category`)                | Free text plus units.                                      |
| eSituation.07/.08 anatomic location, organ system                     | `Condition.bodySite`                                                                  |                                                            |
| eSituation.09/.10 primary and other symptoms                          | `Condition` (symptoms) or `Observation`                                               |                                                            |
| eSituation.11/.12 provider's primary and secondary impression         | `Encounter.diagnosis` (use = primary / secondary) referencing `Condition` (ICD-10-CM) | Core of the clinical summary.                              |
| eSituation.13 initial acuity                                          | `Encounter.priority` or `Observation`                                                 |                                                            |
| eSituation.15/.16 industry, occupation                                | `Observation` (occupation)                                                            | US Core has occupation profile in newer versions (verify). |
| eSituation.17 patient activity (ICD-10 Y93)                           | `Condition`/`Observation`                                                             |                                                            |
| eSituation.18 last known well                                         | `Observation`                                                                         | Stroke-relevant.                                           |
| eSituation.19/.20 transfer justification, reason                      | `Encounter.reasonCode` / extension                                                    |                                                            |
| eHistory.01 barriers to care                                          | `Observation` or `Encounter.extension`                                                |                                                            |
| eHistory.02-.04 patient's practitioner                                | `Patient.generalPractitioner` (`Practitioner`)                                        |                                                            |
| eHistory.05 advance directives                                        | `Consent` or `Observation`; US Core has none (verify)                                 |                                                            |
| eHistory.06/.07 medication, environmental/food allergies              | `AllergyIntolerance` (RxNorm, SNOMED)                                                 |                                                            |
| eHistory.08 medical/surgical history (ICD-10)                         | `Condition` (category history)                                                        |                                                            |
| eHistory.09 history obtained from                                     | `Observation`/`Composition.section.text` provenance                                   |                                                            |
| eHistory.10/.11 immunization type, year                               | `Immunization` (`occurrence[x]` as partial date)                                      | Type list is NEMSIS-specific.                              |
| eHistory.12-.15, .20 current medication, dose, unit, route, frequency | `MedicationStatement`                                                                 | Same dose-unit crosswalk as eMedications.                  |
| eHistory.16 emergency info form                                       | `Observation`/extension                                                               |                                                            |
| eHistory.17 alcohol/drug use                                          | `Observation` (social history)                                                        |                                                            |
| eHistory.18 pregnancy                                                 | `Observation` (pregnancy status)                                                      |                                                            |
| eHistory.19 last oral intake                                          | `Observation`                                                                         |                                                            |

### eProcedures to `Procedure`

| Element                                                                | FHIR target                                        | Note                                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| .01 time, .03 procedure (SNOMED)                                       | `performedDateTime`, `code`                        |                                                                                |
| .02/.15 before arrival / by another unit                               | `status` plus `performer`, or `basedOn`/extension  | Same question as medications: another unit's work is a statement, not our act. |
| .04 equipment size, .13 vascular access location, .14 airway technique | `focalDevice`, `bodySite`, extension               |                                                                                |
| .05 attempts, .06 successful                                           | extension; `outcome`                               | Attempts have no field.                                                        |
| .07 complication (1..*), .08 response                                  | `complication`; `followUp`/`note` or `Observation` |                                                                                |
| .09/.10 crew id, role                                                  | `performer.actor`, `performer.function`            |                                                                                |
| .11/.12 authorization                                                  | `Provenance`/extension                             |                                                                                |

### eDisposition to `Encounter.hospitalization`, `Location`, `Observation`

| Element(s)                                                           | FHIR target                                                                                  | Note                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| .01-.10 destination name, code, address, GPS, USNG                   | `Encounter.hospitalization.destination` (`Location`/`Organization`)                          | Code system for .02 is the state facility list (local).                 |
| .11 patients transported                                             | extension                                                                                    |                                                                         |
| .16/.17/.18 transport method, mode, descriptors                      | extension                                                                                    |                                                                         |
| .13-.15 patient movement, position                                   | extension / `Observation`                                                                    |                                                                         |
| .19 acuity at release                                                | `Observation`                                                                                |                                                                         |
| .20-.24 destination reason, type, in-patient, capability, prearrival | extensions; `Encounter.hospitalization.admitSource`/`dischargeDisposition` where codes align |                                                                         |
| .25 prearrival alert time                                            | extension                                                                                    |                                                                         |
| .26 instructions provided                                            | `Encounter` extension / `Communication`                                                      |                                                                         |
| .27-.31 unit, patient, crew, transport disposition, refusal          | `Encounter.hospitalization.dischargeDisposition` (transport disposition) plus extensions     | One FHIR slot, five NEMSIS answers: proposal is a coded extension each. |
| .32 level of care provided per protocol                              | extension                                                                                    |                                                                         |

Most eResponse, eDispatch and eDisposition elements have no FHIR field, so the mapping leans on **extensions**.
That is acceptable for round trip but weakens interoperability. It needs a decision (open question E).

### ePayment to `Coverage`, `RelatedPerson`, `Claim` support (links to the later X12 work)

| Element(s)                                                                                           | FHIR target                                                       | Note                                                                                |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| .01 primary payment method, .57 payer type                                                           | `Coverage.type`                                                   |                                                                                     |
| .09-.16, .59 insurance company id, name, billing priority, address, phone                            | `Coverage.payor` (`Organization`), `Coverage.order`               |                                                                                     |
| .17/.18/.58 group id, policy id, group name                                                          | `Coverage.class` (group) and `subscriberId`                       |                                                                                     |
| .19-.22, .60 insured name, relationship, DOB                                                         | `Coverage.subscriber` (`Patient`/`RelatedPerson`), `relationship` |                                                                                     |
| .23-.32 closest relative / guardian                                                                  | `RelatedPerson` (with `relationship`)                             |                                                                                     |
| .33-.39 employer                                                                                     | `Organization` or `Patient` extension                             |                                                                                     |
| .02-.07 physician certification statement                                                            | `Claim`-adjacent `Consent`/`DocumentReference`; or extensions     | Billing-specific (PCS for non-emergency transport).                                 |
| .40-.56 CMS service level, transport indicators, reason codes, mileage, supply items, ALS assessment | `Claim` (items) or extensions on `Encounter`                      | Billing detail that FHIR clinical resources do not model; closer to X12 837P loops. |

Open question F: should ePayment go to FHIR at all, or wait for the X12 837P work (blocked) and then share one
internal billing model? Proposal: do clinical sections first, map only `Coverage`/`RelatedPerson` now, and leave
`.40-.56` (billing detail) to be mapped once, alongside 837P.

### Open questions from this pass

E. Extensions for the many NEMSIS elements with no FHIR field: one extension namespace we control (needs a
canonical URL decision, like Q2), or inline them as `Observation`s with NEMSIS-coded codes?
F. As above: how much of ePayment now.
G. Scope order: which of ePatient, eVitals, eMedications, eProcedures, eSituation, eHistory, eDisposition do we
implement first? Proposal for the first code milestone: ePatient, eVitals, eMedications, eProcedures, eSituation
(impressions), and the shell, i.e. enough for a meaningful mPSC document.

## Decisions on the second pass (owner, 2026-11-12, provisional)

- **E (extensions):** yes, extensions in one namespace we control, base URL configurable (same mechanism as Q2).
- **F (ePayment):** `Coverage` and `RelatedPerson` now; `.40-.56` billing detail waits for the 837P work.
- **G (first code milestone):** yes, with **eProcedures undecided**. Owner is unsure; the procedure mapping
  (especially "performed by another unit") stays open and eProcedures is **not** in the first code milestone
  until decided. First milestone: ePatient, eVitals, eMedications, eSituation (impressions), the shell.
- The owner noted they may be near the limit of their own domain knowledge here: this document is a
  well-researched proposal, not a reviewed clinical mapping. Say so in the README when FHIR ships, and mark
  the `fhir` entry experimental.

## Verification pass (2026-11-12)

Checked against hl7.org (page text only):

| Item                                                                                                                                                                                                                                                                                                               | Result                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| LOINC for BP panel `85354-9`, systolic `8480-6`, diastolic `8462-4`, heart rate `8867-4`, resp rate `9279-1`, body temperature `8310-5`, SpO2 `2708-6`, vital signs panel `85353-1`                                                                                                                                | Confirmed (R4 vital-signs page).                                                                        |
| URIs SNOMED `http://snomed.info/sct`, LOINC `http://loinc.org`, RxNorm `http://www.nlm.nih.gov/research/umls/rxnorm`, UCUM `http://unitsofmeasure.org`, CVX `http://hl7.org/fhir/sid/cvx`, NDC `http://hl7.org/fhir/sid/ndc`                                                                                       | Confirmed (R4 terminologies-systems page).                                                              |
| ICD-10-CM `http://hl7.org/fhir/sid/icd-10-cm`, SSN `http://hl7.org/fhir/sid/us-ssn`                                                                                                                                                                                                                                | **Not confirmed**: not found in the part of the page I could read. Still from memory.                   |
| US Core current version                                                                                                                                                                                                                                                                                            | 9.0.0 (STU 9), FHIR R4, generated 2026-05-31 per the IG home page. Pin this and re-check before coding. |
| US Core profiles/extensions named in this doc (Patient, Vital Signs with BP/heart rate/pulse ox/resp rate/temperature children, Condition Encounter Diagnosis, Encounter, Procedure, Immunization, AllergyIntolerance, Observation Occupation, Observation Pregnancy Status; birthsex, race, ethnicity extensions) | Exist by those names. Their element-level requirements were not read.                                   |
| Other LOINC codes (ECG rhythm, ETCO2, GCS, glucose, AVPU, pain, APGAR, pregnancy status)                                                                                                                                                                                                                           | **Still unverified**: look up on loinc.org/the FHIR vitals/US Core pages before coding.                 |

## US Core 9.0.0 package check (2026-11-12)

Downloaded `hl7.fhir.us.core#9.0.0` (FHIR 4.0.1, 218 files, tarball sha256
`af873979a019c9336f8e07882463f5ca6286b5bd20dc2529b80e15cc25f1c0f5`) from `hl7.org/fhir/us/core/package.tgz`
into a scratch directory (not committed) and read the StructureDefinitions' differentials.

Confirmed:
- URIs: `http://hl7.org/fhir/sid/icd-10-cm` and `http://hl7.org/fhir/sid/us-ssn` appear in the package (also cvx, ndc, us-npi).
- Extensions: `us-core-race` (`ombCategory` 0..6 required binding, `detailed`, `text` **required**), `us-core-ethnicity`
  (same shape, separate from race), `us-core-birthsex` (active), `us-core-individual-sex` (active; the Patient profile
  uses this one), `us-core-sex` (**retired**). Earlier tables in this doc said `birthsex`; `individual-sex` is
  now the better target for `ePatient.25`.

Constraints that bite the mapping:
- **Patient:** `identifier` is 1..* (system and value required), `name` 1..*. `ePatient.01` is optional in NEMSIS, so a
  US Core Patient needs a synthesized identifier (e.g. from the PCR number) or we do not claim US Core conformance.
  `address.state` has an extensible USPS state binding, so FIPS codes must be converted to USPS letters.
- **Blood pressure:** US Core BP requires **both** systolic and diastolic components. `eVitals.07` (DBP) is optional
  in NEMSIS, so a systolic-only reading cannot claim the US Core BP profile; fall back to the base FHIR
  vital-signs profile for those. The US Core pulse-oximetry profile requires two codings (pulse ox and O2 sat).
- **Vital signs (base):** `category` with the `vital-signs` code is required; `dataAbsentReason` is must-support, which
  fits the NV/PN plan.
- **Condition (encounter diagnosis):** `category` encounter-diagnosis and `code` required (extensible, includes ICD-10-CM),
  fine for `eSituation.11/.12`.
- **Encounter:** `type` and `subject` required; `identifier` needs system and value; `dischargeDisposition` has a
  _preferred_ binding to v3 US discharge dispositions, so NEMSIS dispositions need a crosswalk or an extension.
- **Procedure:** `code` required. **Immunization:** `vaccineCode` extensible to CVX; the NEMSIS immunization list is
  NEMSIS-specific, so map to CVX or use text. **AllergyIntolerance:** `code` required. **Occupation:** `subject` and
  coded value required, industry as a component. **Pregnancy status:** `subject`, `effectiveDateTime` and a coded value required.
- **No US Core profile exists for `MedicationAdministration` or `MedicationStatement`** (none in the package), so
  eMedications and eHistory current medications use base R4 resources and cannot claim US Core conformance.

Consequence: we can offer a "US Core where it fits" mode, with per-resource profile claims in `meta.profile` only
when the data satisfies the profile, and base R4 otherwise. This is a design decision for the owner (open question H).

Still unverified: LOINC codes for ECG rhythm, ETCO2, GCS, glucose, AVPU, pain, APGAR and pregnancy status.

## Not verified

- I did not read the individual `Composition` StructureDefinition, the package, or the FHIR resource
  definitions beyond memory. The table above is a proposal and must be checked against the IG package and R4
  before any code.
