# Read-Only IoT API

The read-only API provides access to Gantt chart data for integration with IoT devices, dashboards, scripts, or other external systems. All endpoints are **GET only** and return JSON.

## Base URL

```
https://your-domain.com/api/readonly
```

Or when running locally:

```
http://localhost:3001/api/readonly
```

## Authentication

When `API_KEY` is set in your server environment, all requests must include the API key in the header:

```
X-API-Key: your_api_key_here
```

**Example with curl:**

```bash
curl -H "X-API-Key: your_api_key" https://your-domain.com/api/readonly/stats
```

If `API_KEY` is not configured, the API is publicly accessible (no auth required).

**401 response** when API key is invalid or missing (when required):

```json
{
  "error": "Invalid API key"
}
```

---

## Endpoints

### GET /tasks

Returns all tasks (completed and incomplete).

**Response:** Array of task objects

```json
[
  {
    "id": 1,
    "project_id": 1,
    "parent_id": null,
    "name": "Design mockups",
    "start_date": "2025-02-10",
    "end_date": "2025-02-15",
    "due_date": "2025-02-14",
    "progress": 30,
    "completed": false,
    "completed_at": null,
    "base_priority": 7,
    "urgency": 12.5
  },
  {
    "id": 2,
    "project_id": 1,
    "parent_id": null,
    "name": "Write docs",
    "start_date": "2025-02-08",
    "end_date": "2025-02-08",
    "due_date": "2025-02-08",
    "progress": 100,
    "completed": true,
    "completed_at": "2025-02-08T14:32:00.000Z",
    "base_priority": 5,
    "urgency": 0
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Task ID |
| `project_id` | number | Parent project ID |
| `parent_id` | number \| null | Parent task ID if split from another task |
| `name` | string | Task name |
| `start_date` | string | Start date (YYYY-MM-DD) |
| `end_date` | string | End date (YYYY-MM-DD) |
| `due_date` | string \| null | Due date (YYYY-MM-DD) |
| `progress` | number | Progress 0–100 |
| `completed` | boolean | Whether task is completed |
| `completed_at` | string \| null | ISO timestamp when completed |
| `base_priority` | number | User-set priority 1–10 |
| `urgency` | number | Computed urgency (higher = more urgent, 0 when completed) |

---

### GET /most-important-task

Returns the single most urgent incomplete task based on priority and due date proximity.

**Response:** Task object or `null` if no incomplete tasks

```json
{
  "id": 3,
  "project_id": 2,
  "parent_id": null,
  "name": "Fix critical bug",
  "start_date": "2025-02-09",
  "end_date": "2025-02-11",
  "due_date": "2025-02-11",
  "progress": 0,
  "completed": false,
  "completed_at": null,
  "base_priority": 10,
  "urgency": 18.5
}
```

**Empty state (no tasks):**

```json
null
```

---

### GET /stats

Returns aggregate counts and efficiency.

**Response:**

```json
{
  "total": 12,
  "completed": 5,
  "todo": 7,
  "efficiency": 42
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total` | number | Total task count |
| `completed` | number | Completed task count |
| `todo` | number | Incomplete task count |
| `efficiency` | number | Completion percentage (0–100) |

---

### GET /efficiency

Returns efficiency metrics in more detail.

**Response:**

```json
{
  "efficiency": 42,
  "ratio": 0.4166666666666667,
  "completed": 5,
  "total": 12
}
```

| Field | Type | Description |
|-------|------|-------------|
| `efficiency` | number | Rounded percentage (0–100) |
| `ratio` | number | completed / total (0–1) |
| `completed` | number | Completed task count |
| `total` | number | Total task count |

---

### GET /by-category

Returns task counts grouped by category.

**Response:**

```json
[
  {
    "id": 1,
    "name": "Work",
    "task_count": 8
  },
  {
    "id": 2,
    "name": "Personal",
    "task_count": 4
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Category ID |
| `name` | string | Category name |
| `task_count` | number | Number of tasks in this category |

---

### GET /overdue

Returns incomplete tasks whose due date has passed.

**Response:** Array of task objects (same shape as `/tasks`)

```json
[
  {
    "id": 5,
    "project_id": 1,
    "parent_id": null,
    "name": "Review PR",
    "start_date": "2025-02-01",
    "end_date": "2025-02-05",
    "due_date": "2025-02-05",
    "progress": 0,
    "completed": false,
    "completed_at": null,
    "base_priority": 6,
    "urgency": 15
  }
]
```

---

### GET /upcoming

Returns incomplete tasks due within the next N days.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|--------|-------------|
| `days` | number | 7 | Number of days to look ahead |

**Example:**

```
GET /api/readonly/upcoming?days=3
```

**Response:** Array of task objects (same shape as `/tasks`)

```json
[
  {
    "id": 6,
    "project_id": 2,
    "parent_id": null,
    "name": "Ship v1.0",
    "start_date": "2025-02-12",
    "end_date": "2025-02-12",
    "due_date": "2025-02-12",
    "progress": 80,
    "completed": false,
    "completed_at": null,
    "base_priority": 9,
    "urgency": 14.2
  }
]
```

---

### GET /projects

Returns all projects with task counts.

**Response:**

```json
[
  {
    "id": 1,
    "category_id": 1,
    "name": "Q1 Launch",
    "created_at": "2025-02-01T10:00:00.000Z",
    "category_name": "Work",
    "task_count": 6,
    "completed_count": 3
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Project ID |
| `category_id` | number | Category ID |
| `name` | string | Project name |
| `created_at` | string | ISO timestamp |
| `category_name` | string | Category name |
| `task_count` | number | Total tasks in project |
| `completed_count` | number | Completed tasks in project |

---

### GET /categories

Returns all categories with task counts.

**Response:**

```json
[
  {
    "id": 1,
    "name": "Work",
    "display_order": 0,
    "created_at": "2025-02-01T10:00:00.000Z",
    "task_count": 8
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Category ID |
| `name` | string | Category name |
| `display_order` | number | Sort order |
| `created_at` | string | ISO timestamp |
| `task_count` | number | Total tasks in category |

---

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "Error message here"
}
```

| Status | When |
|--------|------|
| 401 | Invalid or missing API key (when `API_KEY` is set) |
| 500 | Server error (with error message) |

---

## IoT Integration Examples

### Display most important task on an e-ink screen

```bash
curl -s -H "X-API-Key: $API_KEY" https://your-server/api/readonly/most-important-task | jq -r '.name'
```

### Light an LED when overdue tasks exist

```bash
OVERDUE=$(curl -s -H "X-API-Key: $API_KEY" https://your-server/api/readonly/overdue)
if [ "$(echo $OVERDUE | jq length)" -gt 0 ]; then
  # Turn on warning LED
  echo 1 > /sys/class/gpio/gpio17/value
else
  echo 0 > /sys/class/gpio/gpio17/value
fi
```

### Show efficiency on a 7-segment display (0–99)

```bash
curl -s -H "X-API-Key: $API_KEY" https://your-server/api/readonly/stats | jq -r '.efficiency'
```

### ESP32/Arduino (pseudo-code)

```cpp
void loop() {
  HTTPClient http;
  http.begin("https://your-server/api/readonly/most-important-task");
  http.addHeader("X-API-Key", "your_api_key");
  int code = http.GET();
  if (code == 200) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, http.getString());
    const char* taskName = doc["name"];
    displayTask(taskName);
  }
  http.end();
  delay(60000); // Poll every minute
}
```
