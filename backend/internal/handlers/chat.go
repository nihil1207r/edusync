package handlers

import (
	"net/url"
	"sort"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

type chatWithMessages struct {
	ID       string                   `json:"id"`
	Messages []map[string]interface{} `json:"messages"`
}

func (d *Deps) ChatGet(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)

	var chats []chatWithMessages
	switch user.Role {
	case "teacher":
		_ = d.UserDB(c).Select("chats", url.Values{"select": {"*,messages(*)"}, "teacher_id": {"eq." + user.ID}}, &chats)
	case "parent":
		_ = d.UserDB(c).Select("chats", url.Values{"select": {"*,messages(*)"}, "parent_id": {"eq." + user.ID}}, &chats)
	}

	if len(chats) == 0 {
		return c.JSON(fiber.Map{"success": true, "messages": []map[string]interface{}{}, "chatId": nil})
	}
	chat := chats[0]
	messages := chat.Messages
	sort.Slice(messages, func(i, j int) bool {
		return toStr(messages[i]["created_at"]) < toStr(messages[j]["created_at"])
	})
	return c.JSON(fiber.Map{"success": true, "messages": orEmpty(messages), "chatId": chat.ID})
}

func (d *Deps) ChatSend(c *fiber.Ctx) error {
	var body struct {
		ChatID string `json:"chatId"`
		Text   string `json:"text"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "Invalid request body."})
	}
	user := middleware.UserFromLocals(c)

	finalChatID := body.ChatID
	if finalChatID == "" {
		row := map[string]interface{}{}
		if user.Role == "teacher" {
			row["teacher_id"] = user.ID
		} else if user.Role == "parent" {
			row["parent_id"] = user.ID
		}
		var created []map[string]interface{}
		if err := d.UserDB(c).Insert("chats", row, true, &created); err == nil && len(created) > 0 {
			finalChatID, _ = created[0]["id"].(string)
		}
	}

	err := d.UserDB(c).Insert("messages", map[string]interface{}{
		"chat_id": finalChatID, "from_id": user.ID, "from_name": user.Name, "text": body.Text,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func toStr(v interface{}) string {
	s, _ := v.(string)
	return s
}
