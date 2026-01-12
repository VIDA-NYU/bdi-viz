"use client";

import { useContext } from "react";
import {
  Box,
} from "@mui/material";

import SourceColumnSelection from "./control-inputs/source-column-selection";
import CandidateThresholdSlide from "./control-inputs/candidate-threshold-slide";
import MatcherSliders from "./control-inputs/matcher-selection";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { SectionHeader } from "@/app/dashboard/layout/components";


interface ControlPanelProps {
  sourceColumns: SourceColumn[];
  matchers: Matcher[];
  isFloating?: boolean;
  width?: string | number;
  containerStyle?: React.CSSProperties;

  onSourceColumnSelect: (columns: string[]) => void;
  onCandidateTypeSelect: (dataType: string) => void;
  onCandidateThresholdSelect: (num: number) => void;
  onMatchersSelect: (matchers: Matcher[]) => void;
  onDefaultMatchersUpdate: (matchers: Matcher[]) => void;
  onMatcherDelete?: (matcherName: string) => Promise<void>;

  state: {
    sourceColumns: string[];
    candidateType: string;
    candidateThreshold: number;
  };
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  isFloating = false, 
  width,
  containerStyle = {},
  ...props 
}) => {

  // Loading Global Context
  const { developerMode } = useContext(SettingsGlobalContext);

  // Root container styles
  const rootStyles = {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    width: "100%",
    gap: 2,
    paddingBottom: 2,
    paddingTop: 2,
  };

  return (
    <>
    <SectionHeader>
      Control Panel
    </SectionHeader>
    <Box sx={rootStyles}>
              <SourceColumnSelection
                sourceColumns={props.sourceColumns}
                selectedSourceColumns={props.state.sourceColumns}
                onSelect={props.onSourceColumnSelect}
              />
              <CandidateThresholdSlide
                sourceColumns={props.sourceColumns}
                selectedCandidateThreshold={props.state.candidateThreshold}
                onSelect={props.onCandidateThresholdSelect}
              />
              {developerMode && (
                <MatcherSliders 
                  matchers={props.matchers} 
                  onSlide={props.onMatchersSelect}
                  onDefaultChange={props.onDefaultMatchersUpdate}
                  onMatcherDelete={props.onMatcherDelete}
                />
              )}
      </Box>
    </>
  );
};

export default ControlPanel;
