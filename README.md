# Optikining — דוח הוצאות והכנסות

אפליקציה מסכמת לקבצי האקסל של חברת אופטיקינג בע"מ.
קוראת את כל קבצי `.xlsx`/`.xls` מתיקיית המקור, מציגה סקירה לפי שנה וקטגוריה,
מאפשרת לסמן חשבוניות מדומות (כדי להוציא מהסיכום) ולהוסיף הערות.

**הקבצים המקוריים אינם נוגעים** — עריכות ושינויי-סיווג נשמרים בקובץ `overlay.json` נפרד.

---

## הפעלה מקומית

```bash
node extract.js     # מייצר data.json מקבצי האקסל (לרוץ אחרי שינוי קבצים)
node server.js      # מפעיל שרת על http://localhost:3030
```

או פשוט: כפול-קליק על `start.bat`.

---

## שיתוף עם אחרים

### A. קישור פומבי מיידי (ה-PC שלך חייב להיות דלוק)

מריצים את ה-tunnel:

```
bin\cloudflared.exe tunnel --url http://localhost:3030
```

מקבלים URL ציבורי של trycloudflare.com שאפשר לשלוח לכל אחד.

### B. פריסה קבועה בענן (Render.com — חינם, לא תלוי במחשב שלך)

1. צור חשבון חינם ב-https://render.com
2. העלה את הפרויקט ל-GitHub (מי שאין לו: `git init && git remote add ...`)
3. ב-Render: "New + → Blueprint" → בחר את ה-repo. ה-`render.yaml` כבר מוגדר.
4. תקבל URL קבוע כמו `https://optikining.onrender.com`

החיסרון בתוכנית החינמית: השרת "נרדם" אחרי 15 דקות חוסר פעילות, ולוקח ~30 שניות להתעורר.

---

## מבנה הפרויקט

| קובץ | תפקיד |
|------|-------|
| `extract.js`   | קורא קבצי xlsx/xls → `data.json` |
| `server.js`    | Express API + מגיש את `public/` |
| `public/`      | האפליקציה (HTML/CSS/JS, ללא build) |
| `data.json`    | הנתונים המעובדים (auto-generated) |
| `overlay.json` | עריכות וסימונים שלך (נשמר אחרי כל פעולה) |
| `start.bat`    | הפעלה במקומי בקליק |
| `render.yaml`  | קונפיג לפריסה ב-Render |

---

## API

- `GET  /api/data` — כל הנתונים המאוחדים
- `PUT  /api/rows/:id` — עדכון תנועה (`{flagged, note, editedDescription}`)
- `PUT  /api/categories/:id` — עדכון קטגוריה (`{section, displayName}`)
- `POST /api/categories/:id/flag` — סימון/ביטול-סימון של כל הקטגוריה
