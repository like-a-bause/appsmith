import React from "react";
import type { ComponentProps } from "widgets/BaseComponent";
import type { Alignment } from "@blueprintjs/core";
import { Classes } from "@blueprintjs/core";
import type { DropdownOption } from "../constants";
import type {
  IItemListRendererProps,
  IItemRendererProps,
} from "@blueprintjs/select";
import { debounce, findIndex, isEmpty, isNil, isNumber } from "lodash";
import equal from "fast-deep-equal/es6";
import "@blueprintjs/select/lib/css/blueprint-select.css";
import { FixedSizeList } from "react-window";
import type { TextSize } from "constants/WidgetConstants";
import {
  StyledControlGroup,
  StyledSingleDropDown,
  DropdownStyles,
  DropdownContainer,
  MenuItem,
} from "./index.styled";
import { WidgetContainerDiff } from "widgets/WidgetUtils";
import type { LabelPosition } from "components/constants";
import SelectButton from "./SelectButton";
import { labelMargin } from "../../WidgetUtils";
import LabelWithTooltip from "widgets/components/LabelWithTooltip";
import { CANVAS_ART_BOARD } from "constants/componentClassNameConstants";

const DEBOUNCE_TIMEOUT = 800;
const ITEM_SIZE = 40;
const MAX_RENDER_MENU_ITEMS_HEIGHT = 300;

interface SelectComponentState {
  activeItemIndex: number | undefined;
  isOpen?: boolean;
}

class SelectComponent extends React.Component<
  SelectComponentProps,
  SelectComponentState
> {
  listRef: any = React.createRef();
  labelRef = React.createRef<HTMLDivElement>();
  spanRef = React.createRef<HTMLSpanElement>();

  state = {
    // used to show focused item for keyboard up down key interection
    activeItemIndex: -1,
    isOpen: false,
  };

  componentDidMount = () => {
    const newState: SelectComponentState = {
      activeItemIndex: this.props.selectedIndex,
    };

    if (this.props.isOpen) {
      newState.isOpen = this.props.isOpen;
    }

    // set default selectedIndex as focused index
    this.setState(newState);
  };

  componentDidUpdate = (prevProps: SelectComponentProps) => {
    if (
      prevProps.selectedIndex !== this.props.selectedIndex &&
      this.state.activeItemIndex !== this.props.selectedIndex
    ) {
      // update focus index if selectedIndex changed by property pane
      this.setState({ activeItemIndex: this.props.selectedIndex });
    }
  };

  togglePopoverVisibility = () => {
    if (this.state.isOpen) {
      this.handleOnDropdownClose();
    } else {
      this.handleOnDropdownOpen();
    }
    this.setState({ isOpen: !this.state.isOpen });
  };

  handleActiveItemChange = (activeItem: DropdownOption | null) => {
    // Update state.activeItemIndex if activeItem is different from the current value
    if (
      activeItem?.value !==
      this.props?.options[this.state.activeItemIndex]?.value
    ) {
      // find new index from options
      const activeItemIndex = findIndex(this.props.options, [
        "label",
        activeItem?.label,
      ]);
      this.setState({ activeItemIndex });
    }
  };

  itemListPredicate(query: string, items: DropdownOption[]) {
    if (!query) return items;

    const filter = items.filter(
      (item) =>
        item.label?.toString().toLowerCase().includes(query.toLowerCase()) ||
        String(item.value).toLowerCase().includes(query.toLowerCase()),
    );
    return filter;
  }

  onItemSelect = (item: DropdownOption): void => {
    this.props.onOptionSelected(item);
    // If Popover is open, then toggle visibility.
    // Required when item selection is made via keyboard input.
    if (this.state.isOpen) this.togglePopoverVisibility();
  };

  isOptionSelected = (currentOption: DropdownOption) => {
    // if currentOption is null, then return false
    if (isNil(currentOption)) return false;

    if (this.props.value) return currentOption.value === this.props.value;

    const optionIndex = findIndex(this.props.options, (option) => {
      return option.value === currentOption.value;
    });
    return optionIndex === this.props.selectedIndex;
  };

  onQueryChange = debounce((filterValue: string) => {
    if (equal(filterValue, this.props.filterText)) return;
    this.props.onFilterChange(filterValue);
    this.listRef?.current?.scrollTo(0);
  }, DEBOUNCE_TIMEOUT);

  renderSingleSelectItem = (
    option: DropdownOption,
    itemProps: IItemRendererProps,
  ) => {
    if (!this.state.isOpen) return null;
    if (!itemProps.modifiers.matchesPredicate) {
      return null;
    }
    const isSelected: boolean = this.isOptionSelected(option);
    // For tabbable menuItems
    const isFocused = itemProps.modifiers.active;
    const focusClassName = `${isFocused && "has-focus"}`;
    const selectedClassName = `${isSelected && "menu-item-active"}`;
    return (
      <MenuItem
        accentColor={this.props.accentColor}
        key={option.value}
        onClick={itemProps.handleClick}
      >
        <a
          className={`menu-item-link ${selectedClassName} ${focusClassName}`}
          tabIndex={0}
        >
          <div className="menu-item-text">{option.label}</div>
        </a>
      </MenuItem>
    );
  };
  handleCancelClick = (event: React.MouseEvent<Element, MouseEvent>) => {
    event.stopPropagation();
    this.onItemSelect({});
  };
  handleOnDropdownOpen = () => {
    if (!this.state.isOpen && this.props.onDropdownOpen) {
      this.props.onDropdownOpen();
    }
  };
  handleOnDropdownClose = () => {
    if (this.state.isOpen && this.props.onDropdownClose) {
      this.props.onDropdownClose();
    }
  };
  handleCloseList = () => {
    if (this.state.isOpen) {
      this.togglePopoverVisibility();
      if (!this.props.selectedIndex) return;
      return this.handleActiveItemChange(
        this.props.options[this.props.selectedIndex],
      );
    } else {
      this.handleOnDropdownClose();
      /**
       * Clear the search input on closing the widget
       * and when serverSideFiltering is off
       */
      if (this.props.resetFilterTextOnClose && this.props.filterText?.length) {
        this.onQueryChange("");
      }

      if (this.props.onClose) {
        this.props.onClose();
      }
    }
  };
  noResultsUI = (
    <MenuItem accentColor={this.props.accentColor}>
      <a className="menu-item-link">
        <div className="menu-item-text">No Results Found</div>
      </a>
    </MenuItem>
  );
  itemListRenderer = (
    props: IItemListRendererProps<any>,
  ): JSX.Element | null => {
    if (!this.state.isOpen) return null;
    let activeItemIndex = this.props.selectedIndex || null;
    if (props.activeItem && activeItemIndex === null) {
      activeItemIndex = props.filteredItems?.findIndex(
        (item) => item.value === props.activeItem?.value,
      );
    }
    if (!props.filteredItems || !props.filteredItems.length)
      return this.noResultsUI;
    return this.renderList(
      props.filteredItems,
      activeItemIndex,
      props.renderItem,
    );
  };
  menuListStyle = { height: "auto", maxHeight: MAX_RENDER_MENU_ITEMS_HEIGHT };
  renderList = (
    items: DropdownOption[],
    activeItemIndex: number | null,
    renderItem: (item: any, index: number) => JSX.Element | null,
  ): JSX.Element | null => {
    // Don't scroll if the list is filtered.
    const optionsCount = this.props.options.length;
    const scrollOffset: number =
      !this.props.filterText &&
      isNumber(activeItemIndex) &&
      optionsCount * ITEM_SIZE > MAX_RENDER_MENU_ITEMS_HEIGHT
        ? activeItemIndex * ITEM_SIZE
        : 0;
    const RowRenderer = (itemProps: any) => (
      <div key={itemProps.index} style={itemProps.style}>
        {renderItem(items[itemProps.index], itemProps.index)}
      </div>
    );
    return (
      <FixedSizeList
        className="menu-virtual-list"
        height={MAX_RENDER_MENU_ITEMS_HEIGHT}
        initialScrollOffset={scrollOffset}
        itemCount={items.length}
        itemSize={ITEM_SIZE}
        ref={this.listRef}
        style={this.menuListStyle}
        width={"100%"}
      >
        {RowRenderer}
      </FixedSizeList>
    );
  };

  getDropdownWidth = () => {
    const parentWidth = this.props.width - WidgetContainerDiff;
    if (this.props.compactMode && this.labelRef.current) {
      const labelWidth = this.labelRef.current.getBoundingClientRect().width;
      const widthDiff = parentWidth - labelWidth - labelMargin;
      return widthDiff > this.props.dropDownWidth
        ? widthDiff
        : this.props.dropDownWidth;
    }
    return parentWidth > this.props.dropDownWidth
      ? parentWidth
      : this.props.dropDownWidth;
  };

  render() {
    const {
      accentColor,
      borderRadius,
      boxShadow,
      compactMode,
      disabled,
      isDynamicHeightEnabled,
      isLoading,
      labelAlignment,
      labelPosition,
      labelStyle,
      labelText,
      labelTextColor,
      labelTextSize,
      labelTooltip,
      labelWidth,
      widgetId,
    } = this.props;
    // active focused item
    const activeItem = () => {
      if (
        this.state.activeItemIndex === -1 ||
        isNil(this.state.activeItemIndex)
      )
        return undefined;
      if (!isEmpty(this.props.options))
        return this.props.options[this.state.activeItemIndex];
    };
    // get selected option label from selectedIndex
    const selectedOption =
      !isEmpty(this.props.options) &&
      this.props.selectedIndex !== undefined &&
      this.props.selectedIndex > -1
        ? this.props.options[this.props.selectedIndex].label
        : this.props.label;
    // for display selected option, there is no separate option to show placeholder
    const value =
      !isNil(selectedOption) && selectedOption !== ""
        ? selectedOption
        : this.props.placeholder || "-- Select --";

    // Check if text overflows
    const tooltipText: string =
      this.spanRef.current?.parentElement &&
      (this.spanRef.current.parentElement.offsetHeight <
        this.spanRef.current.parentElement.scrollHeight ||
        this.spanRef.current.parentElement.offsetWidth <
          this.spanRef.current.parentElement.scrollWidth)
        ? value.toString()
        : "";

    return (
      <DropdownContainer
        className={this.props.className}
        compactMode={compactMode}
        data-testid="select-container"
        labelPosition={labelPosition}
      >
        <DropdownStyles
          accentColor={accentColor}
          borderRadius={borderRadius}
          dropDownWidth={this.getDropdownWidth()}
          id={widgetId}
        />
        {labelText && (
          <LabelWithTooltip
            alignment={labelAlignment}
            className={`select-label`}
            color={labelTextColor}
            compact={compactMode}
            cyHelpTextClassName="select-tooltip"
            disabled={disabled}
            fontSize={labelTextSize}
            fontStyle={labelStyle}
            helpText={labelTooltip}
            isDynamicHeightEnabled={isDynamicHeightEnabled}
            loading={isLoading}
            position={labelPosition}
            ref={this.labelRef}
            text={labelText}
            width={labelWidth}
          />
        )}
        <StyledControlGroup
          $compactMode={compactMode}
          $isDisabled={disabled}
          $labelPosition={labelPosition}
          fill
        >
          <StyledSingleDropDown
            accentColor={accentColor}
            activeItem={activeItem()}
            borderRadius={borderRadius}
            boxShadow={boxShadow}
            className={isLoading ? Classes.SKELETON : ""}
            disabled={disabled}
            filterable={this.props.isFilterable}
            hasError={this.props.hasError}
            isValid={this.props.isValid}
            itemListPredicate={
              !this.props.serverSideFiltering
                ? this.itemListPredicate
                : undefined
            }
            itemListRenderer={this.itemListRenderer}
            itemRenderer={this.renderSingleSelectItem}
            items={this.props.options}
            noResults={this.noResultsUI}
            onActiveItemChange={this.handleActiveItemChange}
            onItemSelect={this.onItemSelect}
            onQueryChange={this.onQueryChange}
            popoverProps={{
              portalContainer:
                document.getElementById(CANVAS_ART_BOARD) || undefined,
              boundary: "window",
              isOpen: this.state.isOpen,
              minimal: true,
              usePortal: true,
              onClose: this.handleCloseList,
              // onActiveItemChange is called twice abd puts the focus on the first item https://github.com/palantir/blueprint/issues/4192
              onOpening: () => {
                if (!this.props.selectedIndex) {
                  return this.handleActiveItemChange(null);
                }
                return this.handleActiveItemChange(
                  this.props.options[this.props.selectedIndex],
                );
              },
              modifiers: {
                preventOverflow: {
                  enabled: false,
                },
              },
              popoverClassName: `select-popover-wrapper select-popover-width-${this.props.widgetId}`,
            }}
            query={this.props.filterText}
            resetOnClose={this.props.resetFilterTextOnClose}
            scrollToActiveItem
            value={this.props.value as string}
          >
            <SelectButton
              disabled={disabled}
              displayText={value.toString()}
              handleCancelClick={this.handleCancelClick}
              hideCancelIcon={this.props.hideCancelIcon}
              spanRef={this.spanRef}
              togglePopoverVisibility={this.togglePopoverVisibility}
              tooltipText={tooltipText}
              value={this.props.value?.toString()}
            />
          </StyledSingleDropDown>
        </StyledControlGroup>
      </DropdownContainer>
    );
  }
}

export interface SelectComponentProps extends ComponentProps {
  className?: string;
  disabled?: boolean;
  onOptionSelected: (optionSelected: DropdownOption) => void;
  placeholder?: string;
  labelAlignment?: Alignment;
  labelPosition?: LabelPosition;
  labelText: string;
  labelTextColor?: string;
  labelTextSize?: TextSize;
  labelStyle?: string;
  labelWidth?: number;
  labelTooltip?: string;
  compactMode: boolean;
  selectedIndex?: number;
  options: DropdownOption[];
  isDynamicHeightEnabled?: boolean;
  isLoading: boolean;
  isFilterable: boolean;
  isValid: boolean;
  width: number;
  dropDownWidth: number;
  height: number;
  serverSideFiltering: boolean;
  hasError?: boolean;
  onFilterChange: (text: string) => void;
  onDropdownOpen?: () => void;
  onDropdownClose?: () => void;
  value?: string | number;
  label?: string | number;
  filterText?: string;
  borderRadius: string;
  boxShadow?: string;
  accentColor?: string;
  isOpen?: boolean;
  onClose?: () => void;
  hideCancelIcon?: boolean;
  resetFilterTextOnClose?: boolean;
}

export default React.memo(SelectComponent);
