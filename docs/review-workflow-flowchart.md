# Photo Review Workflow: Approve / QC Required / NC

Review flow for photo submissions. Use for alignment with leads.

![Photo Review Workflow](review-workflow-flowchart.png)

---

## Flow (at a glance)

1. **Capturer submits photo** → Status: **Pending**
2. **Reviewer** (Review page) filters by Pending / QC Required / NC and chooses per photo:

| Action         | Comment   | Result        |
|----------------|-----------|---------------|
| **Approve**    | Optional  | **Approved** (done) |
| **QC Required** | Required | **QC Required**    |
| **NC**         | Required | **NC**             |

3. **If QC Required or NC:** Capturer sees orange status and comment icon; can view/add comments. To resubmit: **Retake** → "Comment required" modal → enter comment → **Continue to camera** → take photo → resubmit (new image + comment) → Status back to **Pending**.
4. Repeat until **Approved**.

**Status lifecycle:** `Pending` → (Approve) → **Approved**; or (QC Required/NC + comment) → **QC Required** / **NC** → (capturer resubmits + comment) → **Pending**.

---

## Rules summary

| Rule        | Description |
|------------|-------------|
| **Approve** | Optional comment; status → Approved. |
| **QC Required** | Comment required; capturer must add comment before resubmitting. |
| **NC** | Same as QC Required. |
| **Resubmit** | Only for QC/NC; comment required in modal; same row updated; status → Pending. |
| **Comments** | Stored in thread; reviewer and capturer can view and add. |
| **Bulk** | Approve / QC Required / NC; QC/NC require one shared comment. |

---

## Mermaid diagrams

### High-level flow

```mermaid
flowchart TB
  subgraph capture [Capturer]
    Submit[Submit photo]
    Status[See status]
    ViewComments[View comment thread]
    Retake[Retake]
    Resubmit[Resubmit]
  end
  subgraph review [Reviewer]
    Filter[Filter Pending / QC / NC]
    Act[Approve or QC Required or NC]
  end
  Submit --> Pending[(Pending)]
  Pending --> Filter
  Filter --> Act
  Act --> Approved[(Approved)]
  Act --> QC[(QC Required / NC)]
  QC --> Status
  Status --> ViewComments
  Status --> Retake
  Retake --> Resubmit
  Resubmit --> Pending
```

### Status lifecycle

```mermaid
stateDiagram-v2
  [*] --> Pending: Capturer submits
  Pending --> Approved: Reviewer approves
  Pending --> QC_Required: QC Required + comment
  Pending --> NC: NC + comment
  QC_Required --> Pending: Capturer resubmits + comment
  NC --> Pending: Capturer resubmits + comment
  Approved: [*]
```

---

*For full diagrams (reviewer actions, capturer flow) see the PNG or edit this file.*
