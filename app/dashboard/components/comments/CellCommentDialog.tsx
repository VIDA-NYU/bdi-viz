"use client";

import React from "react";
import { Dialog, DialogTitle, DialogContent, Button, TextField, Box, Chip, IconButton, Divider, List, ListItem, ListItemText, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

export type CellComment = { text: string; createdAt: string };

interface CellCommentDialogProps {
  open: boolean;
  sourceColumn?: string;
  targetColumn?: string;
  comments: CellComment[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onClear: () => void;
  onDeleteComment?: (index: number) => void;
  onClearAll?: () => void;
}

const CellCommentDialog: React.FC<CellCommentDialogProps> = ({
  open,
  sourceColumn,
  targetColumn,
  comments,
  draft,
  onDraftChange,
  onSave,
  onCancel,
  onClear,
  onDeleteComment,
  onClearAll,
}) => {
  const theme = useTheme();

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontSize: "1rem", fontWeight: 600, lineHeight: 1.2 }}>
              Comments
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </Typography>
          </Box>
          {sourceColumn && targetColumn && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, flexWrap: "wrap" }}>
              <Chip size="small" color="primary" label={sourceColumn} />
              <ArrowForwardIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Chip size="small" color="secondary" label={targetColumn} />
            </Box>
          )}
        </Box>
        <Tooltip title="Close">
          <IconButton aria-label="Close comments" onClick={onCancel} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          flexDirection: "column",
          height: 480,
          bgcolor: theme.palette.background.paper,
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            px: 2,
            py: 1.5,
            bgcolor: theme.palette.background.default,
          }}
        >
          {comments.length === 0 ? (
            <Box
              sx={{
                border: `1px dashed ${theme.palette.divider}`,
                borderRadius: 2,
                p: 3,
                textAlign: "center",
                color: "text.secondary",
                bgcolor: theme.palette.background.paper,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                No comments yet
              </Typography>
              <Typography variant="caption">Add the first comment below.</Typography>
            </Box>
          ) : (
            <List disablePadding sx={{ bgcolor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
              {comments.map((c, idx) => (
                <React.Fragment key={idx}>
                  <ListItem
                    alignItems="flex-start"
                    sx={{
                      py: 1.25,
                      px: 1.5,
                      gap: 1,
                    }}
                    secondaryAction={
                      onDeleteComment ? (
                        <Tooltip title="Delete">
                          <IconButton edge="end" aria-label="Delete comment" size="small" onClick={() => onDeleteComment(idx)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : undefined
                    }
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {c.text}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {new Date(c.createdAt).toLocaleString()}
                        </Typography>
                      }
                      sx={{ m: 0, pr: onDeleteComment ? 4 : 0 }}
                    />
                  </ListItem>
                  {idx !== comments.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>

        <Divider />

        <Box sx={{ px: 2, py: 1.5, bgcolor: theme.palette.background.paper }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Add a comment
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            placeholder="Write a comment…"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSave();
            }}
          />
          <Box sx={{ mt: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Press Ctrl/⌘ + Enter to post
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              {onClearAll && comments.length > 0 && (
                <Button color="error" variant="text" onClick={onClearAll}>
                  Clear all
                </Button>
              )}
              <Button onClick={onClear} disabled={!draft.trim()}>
                Clear
              </Button>
              <Button onClick={onCancel} variant="outlined">
                Close
              </Button>
              <Button onClick={onSave} variant="contained" disabled={!draft.trim()}>
                Post
              </Button>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default CellCommentDialog;

