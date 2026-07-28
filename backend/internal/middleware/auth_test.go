package middleware

import "testing"

func TestRoleRequiresMFA(t *testing.T) {
	cases := map[string]bool{
		"admin":   false,
		"teacher": false,
		"parent":  false,
		"student": false,
		"driver":  false,
		"":        false,
	}
	for role, want := range cases {
		if got := RoleRequiresMFA(role); got != want {
			t.Errorf("RoleRequiresMFA(%q) = %v, want %v", role, got, want)
		}
	}
}
