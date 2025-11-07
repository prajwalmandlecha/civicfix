import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    Modal,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MultiSelect } from 'react-native-element-dropdown';
import {
    getAllIssueTypes,
    getIssueDisplayName,
} from '../utils/issueTypeMapping';

/**
 * Reusable FilterModal component for filtering issues
 * Used by both HomeScreen and LocationScreen
 */
const FilterModal = ({
    visible,
    onClose,
    filters,
    onApply,
    onReset,
    showRadiusFilter = true, // HomeScreen uses this
    showLimitFilter = true,  // Both use this
}) => {
    const [draftFilters, setDraftFilters] = useState(filters);

    // Sync draft filters when modal opens
    React.useEffect(() => {
        if (visible) {
            setDraftFilters(filters);
        }
    }, [visible, filters]);

    const updateDraftFilter = (filterType, value) => {
        setDraftFilters((prev) => ({ ...prev, [filterType]: value }));
    };

    const handleReset = () => {
        const resetFilters = {
            status: 'open',
            severity: 'all',
            sortBy: 'severity',
            days: 30,
            radiusKm: showRadiusFilter ? 5 : undefined,
            issueTypes: [],
            limit: 20,
        };
        setDraftFilters(resetFilters);
        if (onReset) onReset(resetFilters);
    };

    const handleApply = () => {
        onApply(draftFilters);
    };

    // Prepare dropdown items for issue types
    const issueTypeItems = useMemo(() => {
        return getAllIssueTypes().map((type) => ({
            label: getIssueDisplayName(type),
            value: type,
        }));
    }, []);

    const selectedCount = draftFilters.issueTypes?.length || 0;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.filterModal}>
                    {/* Header */}
                    <View style={styles.filterHeader}>
                        <Text style={styles.filterTitle}>Filters</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.filterContent}
                        contentContainerStyle={styles.filterContentContainer}
                        nestedScrollEnabled={true}
                    >
                        {/* Issue Types Filter with MultiSelect */}
                        <View style={[styles.filterSection, styles.filterSectionDropdown]}>
                            <Text style={styles.filterSectionTitle}>
                                Issue Types {selectedCount > 0 && `(${selectedCount} selected)`}
                            </Text>

                            {/* MultiSelect Dropdown */}
                            <MultiSelect
                                style={styles.dropdown}
                                placeholderStyle={styles.placeholderStyle}
                                selectedTextStyle={styles.selectedTextStyle}
                                inputSearchStyle={styles.inputSearchStyle}
                                iconStyle={styles.iconStyle}
                                search
                                data={issueTypeItems}
                                labelField="label"
                                valueField="value"
                                placeholder="Select issue types..."
                                searchPlaceholder="Search..."
                                value={draftFilters.issueTypes || []}
                                onChange={(items) => {
                                    updateDraftFilter('issueTypes', items);
                                }}
                                renderLeftIcon={() => (
                                    <Ionicons
                                        style={styles.icon}
                                        name="filter"
                                        size={20}
                                        color="#666"
                                    />
                                )}
                                selectedStyle={styles.selectedStyle}
                            />
                        </View>

                        {/* Status Filter */}
                        <View style={[styles.filterSection, styles.filterSectionLower]}>
                            <Text style={styles.filterSectionTitle}>Status</Text>
                            <View style={styles.filterOptions}>
                                {['all', 'open', 'closed'].map((status) => (
                                    <TouchableOpacity
                                        key={status}
                                        style={[
                                            styles.filterOption,
                                            draftFilters.status === status && styles.filterOptionSelected,
                                        ]}
                                        onPress={() => updateDraftFilter('status', status)}
                                    >
                                        <Text
                                            style={[
                                                styles.filterOptionText,
                                                draftFilters.status === status && styles.filterOptionTextSelected,
                                            ]}
                                        >
                                            {status.charAt(0).toUpperCase() + status.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Severity Filter */}
                        <View style={[styles.filterSection, styles.filterSectionLower]}>
                            <Text style={styles.filterSectionTitle}>Severity</Text>
                            <View style={styles.filterOptions}>
                                {['all', 'high', 'medium', 'low'].map((severity) => (
                                    <TouchableOpacity
                                        key={severity}
                                        style={[
                                            styles.filterOption,
                                            draftFilters.severity === severity && styles.filterOptionSelected,
                                        ]}
                                        onPress={() => updateDraftFilter('severity', severity)}
                                    >
                                        <Text
                                            style={[
                                                styles.filterOptionText,
                                                draftFilters.severity === severity && styles.filterOptionTextSelected,
                                            ]}
                                        >
                                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Sort By - Only if applicable */}
                        {filters.sortBy !== undefined && (
                            <View style={[styles.filterSection, styles.filterSectionLower]}>
                                <Text style={styles.filterSectionTitle}>Sort By</Text>
                                <View style={styles.filterOptions}>
                                    {['severity', 'date', 'likes'].map((sort) => (
                                        <TouchableOpacity
                                            key={sort}
                                            style={[
                                                styles.filterOption,
                                                draftFilters.sortBy === sort && styles.filterOptionSelected,
                                            ]}
                                            onPress={() => updateDraftFilter('sortBy', sort)}
                                        >
                                            <Text
                                                style={[
                                                    styles.filterOptionText,
                                                    draftFilters.sortBy === sort && styles.filterOptionTextSelected,
                                                ]}
                                            >
                                                {sort.charAt(0).toUpperCase() + sort.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Days Filter */}
                        <View style={[styles.filterSection, styles.filterSectionLower]}>
                            <Text style={styles.filterSectionTitle}>Time Range</Text>
                            <View style={styles.filterOptions}>
                                {[7, 30, 90, 365].map((days) => (
                                    <TouchableOpacity
                                        key={days}
                                        style={[
                                            styles.filterOption,
                                            draftFilters.days === days && styles.filterOptionSelected,
                                        ]}
                                        onPress={() => updateDraftFilter('days', days)}
                                    >
                                        <Text
                                            style={[
                                                styles.filterOptionText,
                                                draftFilters.days === days && styles.filterOptionTextSelected,
                                            ]}
                                        >
                                            {days}d
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Distance Filter - Conditional */}
                        {showRadiusFilter && (
                            <View style={[styles.filterSection, styles.filterSectionLower]}>
                                <Text style={styles.filterSectionTitle}>Distance</Text>
                                <View style={styles.filterOptions}>
                                    {[2, 5, 10, 25].map((km) => (
                                        <TouchableOpacity
                                            key={km}
                                            style={[
                                                styles.filterOption,
                                                draftFilters.radiusKm === km && styles.filterOptionSelected,
                                            ]}
                                            onPress={() => updateDraftFilter('radiusKm', km)}
                                        >
                                            <Text
                                                style={[
                                                    styles.filterOptionText,
                                                    draftFilters.radiusKm === km && styles.filterOptionTextSelected,
                                                ]}
                                            >
                                                {km} km
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Limit Filter - Conditional */}
                        {showLimitFilter && (
                            <View style={[styles.filterSection, styles.filterSectionLower]}>
                                <Text style={styles.filterSectionTitle}>Number of Issues</Text>
                                <View style={styles.filterOptions}>
                                    {[10, 20, 50, 100].map((count) => (
                                        <TouchableOpacity
                                            key={count}
                                            style={[
                                                styles.filterOption,
                                                draftFilters.limit === count && styles.filterOptionSelected,
                                            ]}
                                            onPress={() => updateDraftFilter('limit', count)}
                                        >
                                            <Text
                                                style={[
                                                    styles.filterOptionText,
                                                    draftFilters.limit === count && styles.filterOptionTextSelected,
                                                ]}
                                            >
                                                {count}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}
                    </ScrollView>

                    {/* Footer with actions */}
                    <View style={styles.filterFooter}>
                        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                            <Text style={styles.resetButtonText}>Reset</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
                            <Text style={styles.applyButtonText}>Apply Filters</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    filterModal: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: '75%',
        width: '100%',
        overflow: 'hidden',
    },
    filterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e1e5e9',
    },
    filterTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterContent: {
        flex: 1,
        paddingHorizontal: 16,
    },
    filterContentContainer: {
        paddingTop: 16,
        paddingBottom: 12,
    },
    filterSection: {
        marginBottom: 20,
    },
    filterSectionDropdown: {
        zIndex: 1,
        elevation: 1,
    },
    filterSectionLower: {
        zIndex: 1,
        elevation: 1,
    },
    filterSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    dropdown: {
        height: 50,
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e1e5e9',
    },
    placeholderStyle: {
        fontSize: 14,
        color: '#999',
    },
    selectedTextStyle: {
        fontSize: 14,
        color: '#333',
    },
    iconStyle: {
        width: 20,
        height: 20,
    },
    inputSearchStyle: {
        height: 40,
        fontSize: 14,
        borderRadius: 8,
        borderColor: '#e1e5e9',
    },
    icon: {
        marginRight: 8,
    },
    selectedStyle: {
        borderRadius: 12,
        backgroundColor: '#4285f4',
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 6,
        marginTop: 8,
    },
    filterOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterOption: {
        backgroundColor: '#f0f0f0',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    filterOptionSelected: {
        backgroundColor: '#4285f4',
        borderColor: '#2563eb',
    },
    filterOptionText: {
        color: '#666',
        fontSize: 14,
        fontWeight: '500',
    },
    filterOptionTextSelected: {
        color: '#fff',
        fontWeight: '600',
    },
    filterFooter: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: '#e1e5e9',
        backgroundColor: '#fff',
        gap: 12,
    },
    resetButton: {
        flex: 1,
        backgroundColor: '#f0f0f0',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resetButtonText: {
        color: '#666',
        fontWeight: '600',
        fontSize: 16,
    },
    applyButton: {
        flex: 2,
        backgroundColor: '#4285f4',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    applyButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default FilterModal;
