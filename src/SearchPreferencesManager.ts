import {
  Component,
  IComponentBindings,
  ComponentOptions,
  LocalStorageUtils,
  IStringMap,
  $$,
  IDoneBuildingQueryEventArgs,
  QueryEvents,
  IQuerySuccessEventArgs,
  IBuildingQueryEventArgs,
} from 'coveo-search-ui';
import { lazyComponent } from '@coveops/turbo-core';
import { SVGIcons } from './utils/SVGUtils';

export interface ISearchPreferencesManagerOptions {
  caption: string;
}

@lazyComponent
export class SearchPreferencesManager extends Component {
  private localStorage: LocalStorageUtils<{ [caption: string]: string[] }>;
  private firstQuery: boolean = true;
  static ID = 'SearchPreferencesManager';

  static options: ISearchPreferencesManagerOptions = {
    caption: ComponentOptions.buildStringOption({ defaultValue: 'Save Filters' }),
  };

  constructor(public element: HTMLElement, public options: ISearchPreferencesManagerOptions, public bindings: IComponentBindings) {
    super(element, SearchPreferencesManager.ID, bindings);
    this.options = ComponentOptions.initComponentOptions(element, SearchPreferencesManager, options);

    this.bindQueryEvents();
    this.buildComponent();

    this.localStorage = new LocalStorageUtils<{ [caption: string]: string[] }>(SearchPreferencesManager.ID);
    // Initially hide the component until the first querySuccess
    this.element.classList.add('preference-hidden');
  }

  private buildComponent() {
    this.element.appendChild(this.buildPreferenceButton());
  }
  private buildPreferenceButton(): HTMLElement {
    const wrapper = $$('div', {
      className: 'preference-wrapper coveo-accessible-button',
    });

    const innerWrapper = $$('div', { className: 'preference-inner flex' });
    // const element = $$('div', { className: 'preference-save flex align-item-center' });
    const element = $$('div', {
      className: 'preference-save flex align-item-center',
      // 'z-index':1,
      role: 'button',
      'aria-label': 'Save Filter Preferences',
      title: 'Save Filter Preferences',
      tabindex: '0',
    });

    element.append($$('div', { className: 'preference-icon-wrapper' }, SVGIcons.icons.floppy).el);
    element.append($$('div', { className: 'preference-save-caption' }, this.options.caption).el);
    element.on('click', () => this.saveFacetState());
    // innerWrapper.on('click', () => this.saveFacetState());

    wrapper.append(innerWrapper.el);
    innerWrapper.append(element.el);
    innerWrapper.append(this.buildClearButton());

    return wrapper.el;
  }

  private buildClearButton() {
    const element = $$('div', {
      className: 'preference-clear coveo-accessible-button',
      'z-index': 10,
      role: 'button',
      'aria-label': 'Clear Filter Preferences',
      title: 'Clear Filter Preferences',
      tabindex: '0',
    });
    element.append($$('span', { className: 'preference-clear-icon' }, SVGIcons.icons.facetClear).el);
    element.append($$('span', {}, 'Reset Saved Filters').el);
    element.on('click', () => this.clearFilter());

    return element.el;
  }

  private bindQueryEvents() {
    this.bind.onRootElement(QueryEvents.deferredQuerySuccess, (arg: IQuerySuccessEventArgs) => this.handleDeferredQuerySuccess(arg));
    this.bind.onRootElement(QueryEvents.buildingQuery, (arg: IBuildingQueryEventArgs) => this.handleBuildingQuery(arg));
    this.bind.onRootElement(QueryEvents.doneBuildingQuery, (arg: IDoneBuildingQueryEventArgs) => this.handleDoneBuildingQuery(arg));
  }

  private handleDeferredQuerySuccess(arg: IQuerySuccessEventArgs) {
    this.firstQuery = false;
    $$(this.element).toggleClass('preference-hidden', !this.queryStateModel.atLeastOneFacetIsActive());
    this.drawClearButtonIfNeeded();
  }

  private drawClearButtonIfNeeded() {
    $$(this.element).toggleClass('filter-applied', this.isFilterApplied());
  }

  private handleBuildingQuery(arg: IDoneBuildingQueryEventArgs) {
    const filterExpression = this.getFilterQueryExpression();
    if (this.firstQuery && filterExpression) {
      arg.queryBuilder.advancedExpression.add(filterExpression);
      this.toggleFacetValues();
    }

    arg.queryBuilder.addContext({ isSavedFilterApplied: !!this.loadFacetStateFromLocalStorage() });
  }

  private handleDoneBuildingQuery(arg: IDoneBuildingQueryEventArgs) {
    if (!this.queryStateModel.atLeastOneFacetIsActive() && !this.isFilterApplied()) {
      this.element.classList.add('preference-hidden');
    }
  }

  private toggleFacetValues(select = true) {
    _.mapObject(this.loadFacetStateFromLocalStorage(), (facetValues: string[], facetField: string) => {
      if (facetValues.length > 0) {
        const facetElement = $$(this.root).find(`.CoveoFacet[data-field="${facetField}"]`);
        if (facetElement) {
          const facet: Facet = get(facetElement, 'Facet') as Facet;
          if (select) {
            facet.selectMultipleValues(facetValues);
          } else {
            facet.deselectMultipleValues(facetValues);
          }
        }
      }
    });
  }

  private getFilterQueryExpression(): string {
    const aq: string[] = [];
    _.mapObject(this.loadFacetStateFromLocalStorage(), (val: string[], key: string) => {
      if (val.length > 0) {
        aq.push(`(${key}==(${_.map(val, (v) => `"${v}"`).join(',')}))`);
      }
    });
    return aq.join(' ');
  }

  private getFilteredFacetTitles(): string[] {
    const aq: string[] = [];
    _.mapObject(this.loadFacetStateFromLocalStorage(), (val: string[], key: string) => {
      if (val.length > 0) {
        const facetElement: HTMLElement = $$(this.root).find(`.CoveoFacet[data-field="s${key}"]`);
        const facetTitle = facetElement ? (facetElement.getAttribute('data-title') as string) : key;

        aq.push(facetTitle);
      }
    });
    return aq;
  }

  private clearFilter() {
    this.toggleFacetValues(false);
    this.localStorage.remove();
    this.drawClearButtonIfNeeded();
    this.queryController.executeQuery({
      beforeExecuteQuery: () => {
        this.usageAnalytics.logCustomEvent({ name: 'searchPreferencesClear', type: 'customEventType' }, {}, this.root);
      },
    });
  }

  private isFilterApplied(): boolean {
    return !!this.loadFacetStateFromLocalStorage();
  }

  private loadFacetStateFromLocalStorage() {
    return this.localStorage.load();
  }

  private showConfirmationCaption() {
    const button: HTMLElement = this.element.querySelector('.preference-save-caption') as HTMLElement;
    button.textContent = 'Filters Saved';
    setTimeout(() => {
      button.textContent = this.options.caption;
    }, 2000);
  }

  private getFacetSelectedValues(): IStringMap<string[]> {
    // $$(this.root).findAll('.CoveoFacet, .CoveoRangePicker');
    const facetElements = $$(this.root).findAll('.CoveoFacet');
    const state: IStringMap<string[]> = {};
    _.each(facetElements, (facetEl) => {
      const facet: Facet = get(facetEl, 'Facet') as Facet;
      if (facet.options.field) {
        state[facet.options.field as string] = facet.getSelectedValues();
      }
    });
    return state;
  }

  private saveFacetState() {
    const state = this.getFacetSelectedValues();

    this.localStorage.save(state);
    this.showConfirmationCaption();
    this.drawClearButtonIfNeeded();
    // this.redrawBreadcrumb();
    this.usageAnalytics.logCustomEvent(
      { name: 'searchPreferencesSelect', type: 'customEventType' },
      {
        searchPreferencesFilter: this.getFilterQueryExpression(),
        filterFields: this.getFilteredFacetTitles().join(','),
      },
      this.root
    );
  }
}
