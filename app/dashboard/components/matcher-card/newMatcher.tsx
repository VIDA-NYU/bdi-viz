"use client";

import { useState, useRef, forwardRef, useContext, useEffect } from "react";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Grid,
  Paper,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { toastify } from "@/app/lib/toastify/toastify-helper";
import { newMatcher, getMatchers } from "@/app/lib/heatmap/heatmap-helper";
import Editor from "@monaco-editor/react";

interface NewMatcherDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (matchers: Matcher[]) => void;
  matchersCallback: (matchers: Matcher[]) => void;
}

interface ParamItem {
  name: string;
  value: string;
  required?: boolean;
}

const DEFAULT_MATCHER_CODE = `# Add your import lines here
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence


class MyCustomMatcher:
    """
    Custom matcher template.

    Required behavior:
    - __init__ must accept name and weight (weight may be ignored but must exist).
    - top_matches must return a list of dicts with:
        * sourceColumn or source (source column name)
        * targetColumn or target (target column name)
        * score (float, higher is better)
      Optional keys:
        * matcher (string)
        * status (string, e.g., "idle")

    Input expectations:
    - source and target are pandas.DataFrame objects.
      Use source.columns and target.columns to get column names.
    """

    def __init__(self, name: str, weight: float = 1.0, **params: Any) -> None:
        # Make sure that the name and weight are present!
        self.name = name
        self.weight = float(weight)
        # Initialize with params if needed

    def top_matches(
        self,
        source,
        target,
        top_k: int = 20,
        **kwargs: Any,
    ) -> List[Dict[str, Any]]:
        """
        Compute candidate matches between source and target columns.

        Return format (list of dicts):
        [
            {
                "sourceColumn": "source_col_name",
                "targetColumn": "target_col_name",
                "score": 0.9,
                "matcher": "my_matcher_name",
                "status": "idle",
            },
            ...
        ]
        """

        # Implement your matching logic here.
        # Example: return an empty list until you implement logic.
        return []
`;

const NewMatcherDialog = forwardRef<HTMLDivElement, NewMatcherDialogProps>(
  ({ open, onClose, onSubmit, matchersCallback }, ref) => {
    const { isLoadingGlobal, setIsLoadingGlobal, setTaskStateFor } = useContext(
      SettingsGlobalContext
    );
    const [name, setName] = useState("MyCustomMatcher");
    const [code, setCode] = useState("");
    const [paramItems, setParamItems] = useState<ParamItem[]>([
      { name: "", value: "" },
    ]);
    const [errors, setErrors] = useState({
      name: false,
      code: false,
    });
    const [errorMessage, setErrorMessage] = useState("");
    const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

    useEffect(() => {
      if (open) {
        // Set default code if empty
        setCode((prev) => prev || DEFAULT_MATCHER_CODE);
        // Ensure 'name' param is present and required as the first param
        setParamItems((prev) => {
          if (!prev.length || prev[0].name !== "name") {
            return [
              { name: "name", value: "", required: true },
              ...prev.filter((p) => p.name !== "name"),
            ];
          }
          return prev;
        });
        setNameManuallyEdited(false); // Reset manual edit tracking on open
      }
    }, [open]);

    const handleAddParam = () => {
      setParamItems([...paramItems, { name: "", value: "" }]);
    };

    const handleRemoveParam = (index: number) => {
      // Prevent removing the 'name' parameter
      if (paramItems[index].name === "name") return;
      const newParams = [...paramItems];
      newParams.splice(index, 1);
      setParamItems(
        newParams.length
          ? newParams
          : [{ name: "name", value: "", required: true }]
      );
    };

    const handleParamChange = (
      index: number,
      field: "name" | "value",
      value: string
    ) => {
      // Prevent changing the name of the required 'name' parameter
      if (index === 0 && field === "name") return;
      const newParams = [...paramItems];
      newParams[index][field] = value;
      setParamItems(newParams);
    };

    const buildParamsObject = (): Record<string, string> => {
      const params: Record<string, string> = {};
      paramItems.forEach((item) => {
        if (item.name.trim()) {
          params[item.name.trim()] = item.value;
        }
      });
      return params;
    };

    const handleNameChange = (value: string) => {
      setName(value);
      setNameManuallyEdited(true);
    };

    const handleCodeChange = (value: string) => {
      setCode(value);
      // Only auto-update name if user hasn't manually edited it
      if (!nameManuallyEdited) {
        const match = value.match(/class\s+(\w+)/);
        if (match && match[1]) {
          setName(match[1]);
        }
      }
    };

    const handleEditorChange = (value: string | undefined) => {
      if (value !== undefined) {
        handleCodeChange(value);
      }
    };

    const handleSubmit = async () => {
      // Validate inputs
      const newErrors = {
        name: !name.trim(),
        code: !code.trim(),
      };

      setErrors(newErrors);
      setErrorMessage(""); // Clear previous error messages

      if (newErrors.name || newErrors.code) {
        return;
      }

      setIsLoadingGlobal(true);
      try {
        const params = buildParamsObject();
        await newMatcher({
          name,
          code,
          params,
          onResult: (newMatchers) => {
            onSubmit(newMatchers);
            getMatchers({ callback: matchersCallback });
            setIsLoadingGlobal(false);
            // Reset form after successful creation
            setName("");
            setCode("");
            setParamItems([{ name: "", value: "" }]);
            setErrors({ name: false, code: false });
            onClose();
            toastify("success", <p>New matcher created successfully!</p>);
          },
          onError: (error) => {
            toastify("error", <p>Error creating matcher: {error}</p>);
            setErrorMessage(error);
            setErrors({
              name: false,
              code: true,
            });
            setIsLoadingGlobal(false);
          },
          taskStateCallback: (taskState) => {
            console.log("Task state:", taskState);
            setTaskStateFor("new_matcher", taskState);
          },
        });
      } catch (error) {
        console.error("Error creating matcher:", error);
        toastify("error", <p>Failed to create matcher. Please try again.</p>);
        setIsLoadingGlobal(false);
      }
    };

    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" ref={ref}>
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#1a2332",
            color: "#ffffff",
          }}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <CodeIcon />
            <Typography variant="h6">Create New Matcher</Typography>
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ color: "#ffffff" }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 2, backgroundColor: "#0f172a" }}>
          <Box component="form" noValidate sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="matcher-name"
              label="Matcher Name"
              name="name"
              autoFocus
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              error={errors.name}
              helperText={errors.name ? "Name is required" : ""}
              FormHelperTextProps={{
                sx: { color: errors.name ? "#f44336" : "#b0b8c4" },
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#2d3a4f" },
                  "&:hover fieldset": { borderColor: "#4dabf5" },
                },
                "& .MuiInputLabel-root": { color: "#b0b8c4" },
                "& .MuiInputBase-input": { color: "#ffffff" },
              }}
            />

            <Typography
              variant="subtitle1"
              sx={{ mt: 3, mb: 1, color: "#ffffff" }}
            >
              Parameters
            </Typography>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                mb: 3,
                backgroundColor: "#1a2332",
                borderColor: "#2d3a4f",
              }}
            >
              {paramItems.map((param, index) => (
                <Grid
                  container
                  spacing={2}
                  key={index}
                  sx={{ mb: index < paramItems.length - 1 ? 2 : 0 }}
                >
                  <Grid item xs={5}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Parameter Name"
                      value={param.name}
                      onChange={(e) =>
                        handleParamChange(index, "name", e.target.value)
                      }
                      required={index === 0}
                      InputProps={{
                        readOnly: index === 0, // Make 'name' param not editable
                      }}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          "& fieldset": { borderColor: "#2d3a4f" },
                        },
                        "& .MuiInputLabel-root": { color: "#b0b8c4" },
                        "& .MuiInputBase-input": { color: "#ffffff" },
                      }}
                    />
                  </Grid>
                  <Grid item xs={5}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Parameter Value"
                      value={param.value}
                      onChange={(e) =>
                        handleParamChange(index, "value", e.target.value)
                      }
                      required={index === 0}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          "& fieldset": { borderColor: "#2d3a4f" },
                        },
                        "& .MuiInputLabel-root": { color: "#b0b8c4" },
                        "& .MuiInputBase-input": { color: "#ffffff" },
                      }}
                    />
                  </Grid>
                  <Grid
                    item
                    xs={2}
                    sx={{ display: "flex", alignItems: "center" }}
                  >
                    <IconButton
                      onClick={() => handleRemoveParam(index)}
                      disabled={index === 0}
                      sx={{ color: "#b0b8c4" }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}

              <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
                <Button
                  startIcon={<AddIcon />}
                  onClick={handleAddParam}
                  variant="outlined"
                  size="small"
                  sx={{
                    color: "#b0b8c4",
                    borderColor: "#2d3a4f",
                    "&:hover": {
                      borderColor: "#4dabf5",
                      color: "#ffffff",
                    },
                  }}
                >
                  Add Parameter
                </Button>
              </Box>
            </Paper>

            <Typography
              variant="subtitle1"
              sx={{ mt: 2, mb: 1, color: "#ffffff" }}
            >
              Matcher Code
            </Typography>

            {errorMessage && (
              <Alert
                severity="error"
                sx={{
                  mb: 2,
                  backgroundColor: "rgba(211, 47, 47, 0.15)",
                  color: "#f44336",
                  "& .MuiAlert-icon": {
                    color: "#f44336",
                  },
                }}
              >
                {errorMessage}
              </Alert>
            )}

            <Box
              sx={{
                height: "400px",
                border: errors.code ? "1px solid #f44336" : "1px solid #2d3a4f",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <Editor
                height="100%"
                defaultLanguage="python"
                value={code}
                onChange={handleEditorChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "on",
                }}
              />
            </Box>
            {errors.code && (
              <Typography
                variant="caption"
                sx={{ mt: 0.5, display: "block", color: "#f44336" }}
              >
                Code is required
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ backgroundColor: "#1a2332", p: 2 }}>
          <Button
            onClick={onClose}
            sx={{ color: "#ffffff" }}
            disabled={isLoadingGlobal}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            disabled={isLoadingGlobal}
            startIcon={isLoadingGlobal ? <CircularProgress size={20} /> : null}
          >
            {isLoadingGlobal ? "Creating..." : "Create Matcher"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
);

NewMatcherDialog.displayName = "NewMatcherDialog";

export default NewMatcherDialog;
