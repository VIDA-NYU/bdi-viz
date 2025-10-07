"use client";

import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Chip, IconButton, InputAdornment, Paper, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SendIcon from "@mui/icons-material/Send";
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
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 500 }}>
            Comment
          </Typography>
          {sourceColumn && targetColumn && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Chip size="small" color="primary" label={sourceColumn} />
              <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Chip size="small" color="secondary" label={targetColumn} />
            </Box>
          )}
        </Box>
      </DialogTitle>
      <DialogContent sx={{ py: 0, px: 1 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{
            maxHeight: 260,
            overflowY: 'auto',
            p: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}>
            {comments.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                No comments yet
              </Typography>
            ) : (
              comments.map((c, idx) => (
                <Box key={idx} sx={{ display: 'flex' }}>
                  <Paper elevation={0} sx={{ p: 1.25, backgroundColor: 'action.hover', borderRadius: 1.5, width: '100%', position: 'relative' }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', pr: 4 }}>{c.text}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {new Date(c.createdAt).toLocaleString()}
                    </Typography>
                    {onDeleteComment && (
                      <IconButton
                        size="small"
                        aria-label="Delete comment"
                        onClick={() => onDeleteComment(idx)}
                        sx={{ position: 'absolute', top: 4, right: 4 }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Paper>
                </Box>
              ))
            )}
          </Box>
          <TextField
            autoFocus
            margin="dense"
            label="Add a comment"
            type="text"
            fullWidth
            multiline
            minRows={3}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={onClear}
                    disabled={!draft.trim()}
                    aria-label="Clear comment"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={onSave}
                    disabled={!draft.trim()}
                  >
                    <SendIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        {onClearAll && comments.length > 0 && (
          <Button color="error" onClick={onClearAll}>Clear all</Button>
        )}
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CellCommentDialog;


