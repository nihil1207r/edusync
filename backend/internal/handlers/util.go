package handlers

import (
	"strconv"
	"time"
)

// orEmpty makes sure a nil slice serializes as [] instead of null, matching
// the JS backend's behavior (supabase-js always returns [] for empty result sets).
func orEmpty(rows []map[string]interface{}) []map[string]interface{} {
	if rows == nil {
		return []map[string]interface{}{}
	}
	return rows
}

func todayDate() string {
	return time.Now().Format("2006-01-02")
}

func trimFloat(f float64) string {
	return strconv.FormatFloat(f, 'f', 1, 64)
}
