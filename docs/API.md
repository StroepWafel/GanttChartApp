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

The read-only API uses **per-user** authentication. Each user has their own username and API key (visible in the app under **Settings → Account** when logged in). All requests must include both:

**Headers:**
```
X-API-Username: your_username
X-API-Key: your_api_key
```

**Or as query parameters:**
```
?username=your_username&api_key=your_api_key
```

**Example with curl (headers):**
```bash
curl -H "X-API-Username: admin" -H "X-API-Key: your_api_key" https://your-domain.com/api/readonly/stats
```

**Example with curl (query):**
```bash
curl "https://your-domain.com/api/readonly/stats?username=admin&api_key=your_api_key"
```

**Data scope:** All endpoints return only data belonging to the authenticated user. Each user’s categories, projects, and tasks are isolated.

**401 responses** when credentials are invalid or missing:
```json
{
  "error": "X-API-Username and X-API-Key (or username and api_key query) required"
}
```
```json
{
  "error": "Invalid API credentials"
}
```

---

## Endpoints

All responses include a `servertime` field (ISO 8601 UTC timestamp) indicating when the response was generated. For endpoints returning arrays, the payload is wrapped as `{ "servertime": "...", "data": [...] }`.

### GET /tasks

Returns all tasks (completed and incomplete).

**Response:** Object with `servertime` and `data` (array of task objects)

```json
{
  "servertime": "2025-02-23T12:00:00.000Z",
  "data": [
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
}
```

| Field | Type | Description |
|-------|------|-------------|
| `servertime` | string | ISO 8601 UTC timestamp when the response was generated |
| `data` | array | Array of task objects (see below) |
| `data[].id` | number | Task ID |
| `data[].project_id` | number | Parent project ID |
| `data[].parent_id` | number \| null | Parent task ID if split from another task |
| `data[].name` | string | Task name |
| `data[].start_date` | string | Start date (YYYY-MM-DD) |
| `data[].end_date` | string | End date (YYYY-MM-DD) |
| `data[].due_date` | string \| null | Due date (YYYY-MM-DD) |
| `data[].progress` | number | Progress 0–100 |
| `data[].completed` | boolean | Whether task is completed |
| `data[].completed_at` | string \| null | ISO timestamp when completed |
| `data[].base_priority` | number | User-set priority 1–10 |
| `data[].urgency` | number | Computed urgency (higher = more urgent, 0 when completed) |

---

### GET /most-important-task

Returns the single most urgent incomplete task based on priority and due date proximity.

**Response:** Object with `servertime` and task fields (when a task exists), or `servertime` and `data: null` (when none)

```json
{
  "servertime": "2025-02-23T12:00:00.000Z",
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
{
  "servertime": "2025-02-23T12:00:00.000Z",
  "data": null
}
```

---

### GET /stats

Returns aggregate counts and efficiency.

**Response:**

```json
{
  "servertime": "2025-02-23T12:00:00.000Z",
  "total": 12,
  "completed": 5,
  "todo": 7,
  "efficiency": 42
}
```

| Field | Type | Description |
|-------|------|-------------|
| `servertime` | string | ISO 8601 UTC timestamp when the response was generated |
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
  "servertime": "2025-02-23T12:00:00.000Z",
  "efficiency": 42,
  "ratio": 0.4166666666666667,
  "completed": 5,
  "total": 12
}
```

| Field | Type | Description |
|-------|------|-------------|
| `servertime` | string | ISO 8601 UTC timestamp when the response was generated |
| `efficiency` | number | Rounded percentage (0–100) |
| `ratio` | number | completed / total (0–1) |
| `completed` | number | Completed task count |
| `total` | number | Total task count |

---

### GET /by-category

Returns task counts grouped by category.

**Response:**

```json
{
  "servertime": "2025-02-23T12:00:00.000Z",
  "data": [
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
}
```

| Field | Type | Description |
|-------|------|-------------|
| `servertime` | string | ISO 8601 UTC timestamp when the response was generated |
| `data` | array | Array of category objects (see below) |
| `data[].id` | number | Category ID |
| `data[].name` | string | Category name |
| `data[].task_count` | number | Number of tasks in this category |

---

### GET /overdue

Returns incomplete tasks whose due date has passed.

**Response:** Object with `servertime` and `data` (array of task objects, same shape as `/tasks`)

```json
{
  "servertime": "2025-02-23T12:00:00.000Z",
  "data": [
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
}
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

**Response:** Object with `servertime` and `data` (array of task objects, same shape as `/tasks`)

```json
{
  "servertime": "2025-02-23T12:00:00.000Z",
  "data": [
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
}
```

---

### GET /projects

Returns all projects with task counts.

**Response:**

```json
{
  "servertime": "2025-02-23T12:00:00.000Z",
  "data": [
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
}
```

| Field | Type | Description |
|-------|------|-------------|
| `servertime` | string | ISO 8601 UTC timestamp when the response was generated |
| `data` | array | Array of project objects (see below) |
| `data[].id` | number | Project ID |
| `data[].category_id` | number | Category ID |
| `data[].name` | string | Project name |
| `data[].created_at` | string | ISO timestamp |
| `data[].category_name` | string | Category name |
| `data[].task_count` | number | Total tasks in project |
| `data[].completed_count` | number | Completed tasks in project |

---

### GET /categories

Returns all categories with task counts.

**Response:**

```json
{
  "servertime": "2025-02-23T12:00:00.000Z",
  "data": [
    {
      "id": 1,
      "name": "Work",
      "display_order": 0,
      "created_at": "2025-02-01T10:00:00.000Z",
      "task_count": 8
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `servertime` | string | ISO 8601 UTC timestamp when the response was generated |
| `data` | array | Array of category objects (see below) |
| `data[].id` | number | Category ID |
| `data[].name` | string | Category name |
| `data[].display_order` | number | Sort order |
| `data[].created_at` | string | ISO timestamp |
| `data[].task_count` | number | Total tasks in category |

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
| 401 | Missing or invalid username/API key |
| 500 | Server error (with error message) |

---

## IoT Integration Examples

### Display most important task on an e-ink screen

```bash
curl -s -H "X-API-Username: $API_USER" -H "X-API-Key: $API_KEY" https://your-server/api/readonly/most-important-task | jq -r '.name'
```

### Light an LED when overdue tasks exist

```bash
OVERDUE=$(curl -s -H "X-API-Username: $API_USER" -H "X-API-Key: $API_KEY" https://your-server/api/readonly/overdue)
if [ "$(echo $OVERDUE | jq '.data | length')" -gt 0 ]; then
  # Turn on warning LED
  echo 1 > /sys/class/gpio/gpio17/value
else
  echo 0 > /sys/class/gpio/gpio17/value
fi
```

### Show efficiency on a 7-segment display (0–99)

```bash
curl -s -H "X-API-Username: $API_USER" -H "X-API-Key: $API_KEY" https://your-server/api/readonly/stats | jq -r '.efficiency'
```

### ESP32/Arduino (pseudo-code)

```cpp
void loop() {
  HTTPClient http;
  http.begin("https://your-server/api/readonly/most-important-task");
  http.addHeader("X-API-Username", "your_username");
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
