# PAIS 2.0 & PNP Survey System Integration Guide

**System Target:** PNP Preferred Assignment Location Survey & Admin Dashboard  
**External System:** PAIS 2.0 (Personnel Accounting Information System 2.0)  
**Document Purpose:** Architectural blueprint, feasibility assessment, and step-by-step execution guide for connecting PAIS 2.0 with the Survey system without breaking existing survey cycles, responses, or transfer audit histories.

---

## 1. Feasibility Assessment: "Can I Just Change My Database?"

### Verdict: ❌ DO NOT change the existing database schema directly.

Altering or replacing the database tables in place is high-risk and will cause immediate system failures for the following reasons:

1. **Django ORM & Migration Desynchronization**:
   The Survey system is built on Django. Its database schema is strictly synchronized with Python model definitions (`PersonnelRecord`, `DashboardPersonnel`, `SurveyResponse`, etc.) and the `django_migrations` table. Altering table columns, names, or types directly via raw SQL will cause runtime crashes (`ProgrammingError`, `FieldError`) across views, API endpoints, and deployment pipelines (e.g., Railway pre-deploy `python manage.py migrate`).

2. **Strict Foreign Key Constraints (`PROTECT`)**:
   Key domain relationships in the Survey database enforce `on_delete=PROTECT`. This includes:
   - `SurveyResponse` $\rightarrow$ `PersonnelRecord`
   - `SurveyResponse` $\rightarrow$ `OfficeUnit` (for 1st, 2nd, and 3rd preferences)
   - `TransferMovement` $\rightarrow$ `PersonnelRecord`, `DashboardPersonnel`, `OfficeUnit`
   - `DashboardPersonnel` $\rightarrow$ `DashboardUnit`, `DashboardRosterImport`
   
   If you try to drop, re-create, or merge tables directly, PostgreSQL will reject modifications. Forcing changes by disabling constraints will orphan or destroy historical responses, receipt tokens, and transfer logs.

3. **Dual-Roster Scopes**:
   The application deliberately maintains two separate personnel representations:
   - `PersonnelRecord`: Roster authorized to answer the survey.
   - `DashboardPersonnel`: Comprehensive deployment roster used for staffing and capacity monitoring.
   
   Replacing this with a single raw table from PAIS 2.0 breaks access control (allowing ineligible personnel to submit surveys) or distorts authorized vs. actual staffing calculations.

4. **NUP Identity Discrepancies**:
   Police officers (PCO/PNCO) have badges. Non-Uniformed Personnel (NUP) often have salary grades (e.g., `SG-11`) in badge fields. The Survey system derives NUP keys via `NUP:NAME:<normalized full name>`. Enforcing a single naive badge-based primary/unique key across all personnel will cause NUP inserts to collide and fail.

---

## 2. Recommended Architecture: The Staging & Crosswalk Pattern

Instead of altering existing domain tables, use an **isolated staging schema and an identity crosswalk table**.

```
[ PAIS 2.0 Database / API ]
            │
            ▼ (Batch sync / ETL / API ingestion)
[ pais_staging.personnel ] (Raw PAIS staging table)
            │
            ▼ (Validation & Conflict Resolution)
[ pais_staging.personnel_crosswalk ] (Maps PAIS IDs <-> Survey PKs)
            │
            ▼ (Promoted via Django Service Layer)
┌─────────────────────────────────────────────────────────────┐
│  Django Domain Tables                                       │
│  ├── PersonnelRecord       (Survey-eligible personnel)      │
│  ├── DashboardPersonnel    (Full deployment roster)         │
│  └── SurveyResponse        (Responses & preferences intact) │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Step-by-Step Implementation Roadmap

### Step 1: Formalize Ownership Boundaries & Scope
* **PAIS 2.0 owns:** Official ranks, badge numbers, full names, birthdates, official PNP assignment stations, and designation dates.
* **Survey System owns:** Survey cycles, survey status, 1st/2nd/3rd preferred assignments, family and residential details, receipts, transfer planning drafts, and transfer implementation history.
* **Survey Eligibility Rule:** Define the exact query/rule determining who in PAIS 2.0 is eligible to answer the survey (e.g., `status = 'ACTIVE'` AND `unit = 'ITMS'`).

### Step 2: Create Staging & Crosswalk Tables in PostgreSQL
Run the following DDL in your PostgreSQL database to establish the staging and crosswalk tables:

```sql
-- Create an isolated staging schema
CREATE SCHEMA IF NOT EXISTS pais_staging;

-- Staging table for incoming PAIS 2.0 personnel extract
CREATE TABLE IF NOT EXISTS pais_staging.raw_personnel (
    id BIGSERIAL PRIMARY KEY,
    pais_id VARCHAR(100) NOT NULL,
    badge_number VARCHAR(40),
    rank_category VARCHAR(10) NOT NULL, -- PCO, PNCO, NUP
    rank_code VARCHAR(80),
    full_name VARCHAR(220) NOT NULL,
    birthdate DATE NOT NULL,
    designation_date DATE,
    designation VARCHAR(220),
    office_unit VARCHAR(220),
    division VARCHAR(180),
    sub_section VARCHAR(180),
    area_location VARCHAR(220),
    is_active BOOLEAN DEFAULT TRUE,
    is_survey_eligible BOOLEAN DEFAULT FALSE,
    imported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Crosswalk table bridging PAIS 2.0 with Survey system identities
CREATE TABLE IF NOT EXISTS pais_staging.personnel_crosswalk (
    id BIGSERIAL PRIMARY KEY,
    source_system VARCHAR(50) DEFAULT 'PAIS_2.0',
    source_person_id VARCHAR(100) NOT NULL,
    badge_number VARCHAR(40),
    survey_personnel_id BIGINT REFERENCES survey_personnelrecord(id) ON DELETE SET NULL,
    dashboard_personnel_id BIGINT REFERENCES survey_dashboardpersonnel(id) ON DELETE SET NULL,
    match_method VARCHAR(50) NOT NULL, -- 'BADGE_EXACT', 'NUP_NAME_MATCH', 'MANUAL_OVERRIDE'
    review_status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'VERIFIED', 'CONFLICT'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_source_person UNIQUE (source_system, source_person_id)
);

CREATE INDEX IF NOT EXISTS idx_crosswalk_badge ON pais_staging.personnel_crosswalk(badge_number);
CREATE INDEX IF NOT EXISTS idx_crosswalk_survey_id ON pais_staging.personnel_crosswalk(survey_personnel_id);
```

### Step 3: Run Conflict Detection & Pre-Validation
Before promoting staged records into the live survey tables, run verification queries to catch discrepancies:

```sql
-- 1. Check for duplicate badges in PAIS feed
SELECT badge_number, COUNT(*)
FROM pais_staging.raw_personnel
WHERE rank_category IN ('PCO', 'PNCO') AND badge_number IS NOT NULL
GROUP BY badge_number
HAVING COUNT(*) > 1;

-- 2. Detect NUP name collisions
SELECT UPPER(REGEXP_REPLACE(full_name, '[^A-Za-z0-9]', '', 'g')) AS normalized_name, COUNT(*)
FROM pais_staging.raw_personnel
WHERE rank_category = 'NUP'
GROUP BY 1
HAVING COUNT(*) > 1;

-- 3. Identify missing required birthdates
SELECT COUNT(*) AS missing_birthdates
FROM pais_staging.raw_personnel
WHERE birthdate IS NULL;
```

### Step 4: Promote Verified Records via Django Management Command
To maintain full Django validation and audit trails, execute the promotion through Python/Django rather than raw SQL inserts.

Example Django management command structure (`survey/management/commands/sync_pais_roster.py`):
```python
from django.core.management.base import BaseCommand
from django.db import transaction
from survey.models import PersonnelRecord, DashboardPersonnel, DashboardUnit
# Import staging queries and synchronization logic
```

For file-based roster updates, continue using the tested and hardened CLI tools:
```powershell
# Update eligible survey roster (keep_missing prevents deactivating omitted records during partial syncs)
python manage.py load_personnel_roster path/to/pais_eligible_roster.xlsx --keep-missing

# Preview and commit complete deployment roster
python manage.py load_dashboard_roster path/to/pais_full_roster.xlsx --expected-total <COUNT> --commit
```

### Step 5: Reset Sequence Counters
When batch-inserting or synchronizing records into PostgreSQL tables with explicit primary keys, reset the sequence counters to avoid duplicate-key errors on subsequent user submissions:

```sql
SELECT setval(pg_get_serial_sequence('survey_personnelrecord', 'id'), COALESCE(MAX(id), 1)) FROM survey_personnelrecord;
SELECT setval(pg_get_serial_sequence('survey_dashboardpersonnel', 'id'), COALESCE(MAX(id), 1)) FROM survey_dashboardpersonnel;
```

---

## 4. Pre-Cutover Verification Checklist

- [ ] **Badge Integrity**: All badges retain leading zeros (`012345` is not truncated to `12345`).
- [ ] **NUP Validation**: NUP identity keys follow `NUP:NAME:<normalized_name>` without duplicate key conflicts.
- [ ] **Survey Responses Preserved**: Zero orphaned rows in `survey_surveyresponse`; existing responses remain linked to correct cycles and personnel.
- [ ] **Transfer History Intact**: `original_assignment` JSON blobs and transfer movements remain intact and readable.
- [ ] **Capacity & Dashboard Metrics**: Authorized vs. actual staffing counts by PCO, PNCO, and NUP match expected PAIS figures.
- [ ] **End-to-End Simulation**:
  - Verify badge via `/api/personnel/verify/`.
  - Submit survey response.
  - Review response in staff admin workspace.
  - Test transfer plan creation with candidate.
