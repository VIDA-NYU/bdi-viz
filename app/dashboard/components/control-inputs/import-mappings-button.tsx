"use client";

import { useContext, useRef } from "react";
import { IconButton } from "@mui/material";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";

import {
  getCachedResults,
  getUserOperationHistory,
  getValueMatches,
  importMappings,
} from "@/app/lib/heatmap/heatmap-helper";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { toastify } from "@/app/lib/toastify/toastify-helper";

interface ImportMappingsButtonProps {
  onCandidatesUpdate: (candidates: Candidate[]) => void;
  onValueMatchesUpdate: (valueMatches: ValueMatch[]) => void;
  onUserOperationsUpdate: (userOperations: UserOperation[]) => void;
}

const ImportMappingsButton: React.FC<ImportMappingsButtonProps> = ({
  onCandidatesUpdate,
  onValueMatchesUpdate,
  onUserOperationsUpdate,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { setIsLoadingGlobal } = useContext(SettingsGlobalContext);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const format = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";

    try {
      setIsLoadingGlobal(true);
      const content = await file.text();

      const summary = await importMappings({
        content,
        format,
      });

      await Promise.all([
        getCachedResults({ callback: onCandidatesUpdate }),
        getValueMatches({ callback: onValueMatchesUpdate }),
        getUserOperationHistory({ callback: onUserOperationsUpdate }),
      ]);

      const acceptedCount = summary?.accepted_pairs ?? summary?.acceptedPairs ?? 0;
      const valueUpdates = summary?.value_updates ?? summary?.valueUpdates ?? 0;
      const detailSuffix = valueUpdates ? `, ${valueUpdates} value updates` : "";
      toastify(
        "success",
        `Imported mappings: ${acceptedCount} pairs accepted${detailSuffix}.`
      );
    } catch (error: any) {
      console.error("Failed to import mappings:", error);
      const message = error?.message || "Unable to import mappings.";
      toastify("error", message);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsLoadingGlobal(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <IconButton
        onClick={() => fileInputRef.current?.click()}
        sx={{
          py: 0,
          px: 0,
          borderRadius: 1,
          color: "primary.main",
          "&:hover": { color: "primary.dark" },
        }}
        title="Import mappings (JSON or CSV)"
      >
        <FileUploadOutlinedIcon />
      </IconButton>
    </>
  );
};

export default ImportMappingsButton;
