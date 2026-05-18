/*
 * Copyright (C) 2026 Astral Contributors
 *
 * This file is part of Astral.
 *
 * Astral is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Astral is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

package integration

import (
	"fmt"
	"net/http"
	"testing"
)

func TestAuthDesktopHandoffPendingStatusAndCancelRequireControlToken(t *testing.T) {
	clientA := newTestClient(t)
	clientB := newTestClient(t)

	resp, err := clientA.postJSON("/auth/handoff/initiate", nil)
	if err != nil {
		t.Fatalf("failed to initiate desktop handoff: %v", err)
	}
	assertStatus(t, resp, http.StatusOK)

	var initResp handoffInitiateResponse
	decodeJSONResponse(t, resp, &initResp)
	if initResp.ControlToken == "" {
		t.Fatalf("expected handoff control token")
	}

	statusURL := fmt.Sprintf("/auth/handoff/%s/status", initResp.Code)
	resp, err = clientB.get(statusURL)
	if err != nil {
		t.Fatalf("failed to poll handoff status from second client: %v", err)
	}
	assertStatus(t, resp, http.StatusOK)

	var status handoffStatusResponse
	decodeJSONResponse(t, resp, &status)
	if status.Status != "expired" {
		t.Fatalf("expected second client to see expired status, got %s", status.Status)
	}
	resp.Body.Close()

	cancelURL := fmt.Sprintf("/auth/handoff/%s", initResp.Code)
	resp, err = clientB.delete(cancelURL, "")
	if err != nil {
		t.Fatalf("failed to cancel handoff from second client: %v", err)
	}
	assertStatus(t, resp, http.StatusNoContent)
	resp.Body.Close()

	resp, err = clientA.getWithHeaders(statusURL, map[string]string{
		"X-Astral-Handoff-Control": initResp.ControlToken,
	})
	if err != nil {
		t.Fatalf("failed to poll handoff status from initiator: %v", err)
	}
	assertStatus(t, resp, http.StatusOK)
	decodeJSONResponse(t, resp, &status)
	if status.Status != "pending" {
		t.Fatalf("expected initiator to still see pending status, got %s", status.Status)
	}
	resp.Body.Close()
}
