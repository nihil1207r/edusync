package handlers

import (
	"net/url"
	"time"

	"github.com/gofiber/fiber/v2"
)

type studentRow struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Class  string   `json:"class"`
	RollNo string   `json:"roll_no"`
	Points int      `json:"points"`
	Badges []string `json:"badges"`
}

type homeworkRow struct {
	ID string `json:"id"`
}

// Seed mirrors POST /admin/seed: seeds demo profiles, students, grades,
// attendance, announcements, homework, wellness entries, and a sample chat.
func (d *Deps) Seed(c *fiber.Ctx) error {
	var body struct {
		Password string `json:"password"`
	}
	_ = c.BodyParser(&body)
	if body.Password != "admin123" {
		return c.JSON(fiber.Map{"success": false, "message": "Wrong password."})
	}

	authUsers, err := d.DB.AdminListUsers()
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Cannot list users: " + err.Error()})
	}
	userMap := map[string]string{}
	for _, u := range authUsers {
		userMap[u.Email] = u.ID
	}

	type profileSeed struct {
		Name    string
		Role    string
		Class   string
		Subject string
		RollNo  string
		Points  int
	}
	profileMap := map[string]profileSeed{
		"admin@edunexus.com": {Name: "Admin User", Role: "admin"},
		"priya@edunexus.com": {Name: "Mrs. Priya Sharma", Role: "teacher", Class: "10A", Subject: "Mathematics"},
		"arjun@edunexus.com": {Name: "Mr. Arjun Kumar", Role: "parent"},
		"rahul@edunexus.com": {Name: "Rahul Kumar", Role: "student", Class: "10A", RollNo: "101", Points: 450},
	}

	for email, p := range profileMap {
		uid, ok := userMap[email]
		if !ok {
			continue
		}
		row := map[string]interface{}{"id": uid, "email": email, "name": p.Name, "role": p.Role}
		if p.Class != "" {
			row["class"] = p.Class
		}
		if p.Subject != "" {
			row["subject"] = p.Subject
		}
		if p.RollNo != "" {
			row["roll_no"] = p.RollNo
		}
		if p.Points != 0 {
			row["points"] = p.Points
		}
		_ = d.DB.Upsert("profiles", row, "", false, nil)
	}

	var students []studentRow
	studentSeed := []map[string]interface{}{
		{"name": "Rahul Kumar", "class": "10A", "roll_no": "101", "points": 450, "badges": []string{"🌟 Star Student", "📚 Bookworm"}},
		{"name": "Priya Patel", "class": "10A", "roll_no": "102", "points": 380, "badges": []string{"🎯 On Target"}},
		{"name": "Arjun Singh", "class": "10A", "roll_no": "103", "points": 520, "badges": []string{"🏆 Champion", "⚡ Quick Learner"}},
		{"name": "Sneha Rao", "class": "10A", "roll_no": "104", "points": 290, "badges": []string{"💡 Creative"}},
		{"name": "Karthik M", "class": "10A", "roll_no": "105", "points": 410, "badges": []string{"🌟 Star Student"}},
	}
	if err := d.DB.Upsert("students", studentSeed, "roll_no,class", true, &students); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "seed students: " + err.Error()})
	}

	if len(students) > 0 {
		parentID, hasParent := userMap["arjun@edunexus.com"]
		studentUserID, hasStudent := userMap["rahul@edunexus.com"]
		if hasParent {
			_ = d.DB.Update("profiles", url.Values{"id": {"eq." + parentID}}, map[string]interface{}{"child_id": students[0].ID})
		}
		if hasStudent {
			_ = d.DB.Update("profiles", url.Values{"id": {"eq." + studentUserID}}, map[string]interface{}{"child_id": students[0].ID})
		}
	}

	subjects := []string{"Mathematics", "Science", "English", "History", "Computer Science"}
	gradeData := [][]int{
		{85, 90, 78, 88, 95},
		{72, 68, 80, 75, 82},
		{91, 88, 85, 90, 97},
		{65, 70, 72, 68, 75},
		{88, 85, 90, 82, 92},
	}
	if len(students) > 0 {
		var gradesInsert []map[string]interface{}
		for si, s := range students {
			for subI, sub := range subjects {
				marks := gradeData[si][subI]
				grade := "C"
				switch {
				case marks >= 90:
					grade = "A+"
				case marks >= 80:
					grade = "A"
				case marks >= 70:
					grade = "B"
				}
				gradesInsert = append(gradesInsert, map[string]interface{}{
					"student_id": s.ID, "subject": sub, "marks": marks, "total": 100, "grade": grade,
				})
			}
		}
		_ = d.DB.Upsert("grades", gradesInsert, "", false, nil)
	}

	if len(students) > 0 {
		var attendanceInsert []map[string]interface{}
		for _, s := range students {
			for dOff := 0; dOff < 7; dOff++ {
				date := time.Now().AddDate(0, 0, -dOff)
				status := "present"
				if seedRand(s.ID, dOff) < 0.15 {
					status = "absent"
				}
				attendanceInsert = append(attendanceInsert, map[string]interface{}{
					"student_id": s.ID, "date": date.Format("2006-01-02"), "status": status,
				})
			}
		}
		_ = d.DB.Upsert("attendance", attendanceInsert, "student_id,date", false, nil)
	}

	_ = d.DB.Upsert("announcements", []map[string]interface{}{
		{"title": "📝 Unit Test Next Week", "message": "Unit test scheduled from Monday. Students must carry ID cards.", "by_name": "Mrs. Priya Sharma", "important": true},
		{"title": "🏖️ School Picnic", "message": "Annual school picnic on 25th June. Permission slips due Friday.", "by_name": "Mrs. Priya Sharma", "important": false},
		{"title": "📚 Library Books Due", "message": "All library books must be returned before end of term.", "by_name": "Mrs. Priya Sharma", "important": false},
	}, "", false, nil)

	var hwData []homeworkRow
	_ = d.DB.Upsert("homework", []map[string]interface{}{
		{"title": "Math Chapter 5 Exercise", "subject": "Mathematics", "description": "Complete exercises 5.1 to 5.4", "due_date": time.Now().Add(24 * time.Hour).Format(time.RFC3339), "points": 50},
		{"title": "Science Lab Report", "subject": "Science", "description": "Write lab report on photosynthesis", "due_date": time.Now().Add(48 * time.Hour).Format(time.RFC3339), "points": 75},
		{"title": "English Essay", "subject": "English", "description": "Write 500 word essay on climate change", "due_date": time.Now().Add(72 * time.Hour).Format(time.RFC3339), "points": 60},
	}, "", true, &hwData)

	if len(hwData) >= 2 && len(students) >= 2 {
		_ = d.DB.Upsert("homework_submissions", []map[string]interface{}{
			{"homework_id": hwData[0].ID, "student_id": students[0].ID},
			{"homework_id": hwData[1].ID, "student_id": students[0].ID},
			{"homework_id": hwData[1].ID, "student_id": students[1].ID},
		}, "homework_id,student_id", false, nil)
	}

	if len(students) > 0 {
		moods := []int{4, 3, 5, 2, 4, 3, 5}
		msgs := []string{"Feeling good today!", "A bit stressed about exams", "Had a great day!",
			"Feeling overwhelmed", "Pretty normal day", "Tired but okay", "Excited about picnic!"}
		var wellnessInsert []map[string]interface{}
		for i, mood := range moods {
			date := time.Now().AddDate(0, 0, -i)
			sentiment := "neutral"
			if mood >= 4 {
				sentiment = "positive"
			} else if mood <= 2 {
				sentiment = "negative"
			}
			wellnessInsert = append(wellnessInsert, map[string]interface{}{
				"student_id": students[0].ID, "mood": mood, "message": msgs[i],
				"sentiment": sentiment, "created_at": date.Format(time.RFC3339),
			})
		}
		_ = d.DB.Upsert("wellness", wellnessInsert, "", false, nil)
	}

	teacherID, hasTeacher := userMap["priya@edunexus.com"]
	parentID, hasParent := userMap["arjun@edunexus.com"]
	if hasTeacher && hasParent && len(students) > 0 {
		var chats []map[string]interface{}
		err := d.DB.Upsert("chats", map[string]interface{}{
			"teacher_id": teacherID, "parent_id": parentID, "student_id": students[0].ID,
		}, "teacher_id,parent_id", true, &chats)
		if err == nil && len(chats) > 0 {
			chatID := chats[0]["id"]
			_ = d.DB.Upsert("messages", []map[string]interface{}{
				{"chat_id": chatID, "from_id": teacherID, "from_name": "Mrs. Priya", "text": "Hello! Rahul has been doing great in class recently.", "created_at": time.Now().Add(-1 * time.Hour).Format(time.RFC3339)},
				{"chat_id": chatID, "from_id": parentID, "from_name": "Mr. Arjun", "text": "Thank you! He has been studying hard at home too.", "created_at": time.Now().Add(-30 * time.Minute).Format(time.RFC3339)},
				{"chat_id": chatID, "from_id": teacherID, "from_name": "Mrs. Priya", "text": "Please make sure he submits the Math homework by tomorrow.", "created_at": time.Now().Add(-15 * time.Minute).Format(time.RFC3339)},
			}, "", false, nil)
		}
	}

	emails := make([]string, 0, len(userMap))
	for e := range userMap {
		emails = append(emails, e)
	}
	return c.JSON(fiber.Map{"success": true, "message": "✅ All demo data seeded!", "usersFound": emails, "userIds": userMap})
}

// seedRand is a tiny deterministic pseudo-random helper so re-running seed
// gives stable attendance patterns per student/day (avoids a real RNG dep
// for what's just demo data).
func seedRand(seed string, n int) float64 {
	h := 0
	for _, ch := range seed {
		h = (h*31 + int(ch)) % 1000
	}
	v := (h + n*17) % 100
	return float64(v) / 100
}
